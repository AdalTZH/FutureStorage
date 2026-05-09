'use client';

import { useState, useEffect } from 'react';
import { mascotSay } from '@/utils/mascot';
import { api } from '@/utils/api';

let stripePromise = null;
let Elements = null;
let PaymentElement = null;
let useStripe = null;
let useElements = null;

function loadStripeComponents() {
  if (typeof window === 'undefined') return;
  const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!pk || pk === 'pk_test_...') return;

  import('@stripe/stripe-js').then(({ loadStripe }) => {
    stripePromise = loadStripe(pk);
  });
  import('@stripe/react-stripe-js').then(mod => {
    Elements       = mod.Elements;
    PaymentElement = mod.PaymentElement;
    useStripe      = mod.useStripe;
    useElements    = mod.useElements;
  });
}

function MockCheckoutForm({ booking, onSuccess, onError }) {
  const [status, setStatus] = useState('idle');

  const handleMockPay = async () => {
    setStatus('processing');
    await new Promise(r => setTimeout(r, 1500));
    setStatus('success');
    mascotSay('booking_done', 'All set! Your items are safe with us.');
    api.proactiveTrigger({
      type: 'booking_confirmed',
      user_id: 'demo_user',
      booking: {
        host_name:  booking.hostName,
        address:    booking.address,
        start_date: booking.startDate,
        end_date:   booking.endDate,
        total_sgd:  booking.totalPrice,
        id:         booking.id,
      },
    }).catch(() => {});
    onSuccess?.();
  };

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 rounded-xl p-4 text-sm text-amber-800">
        💳 Payment is held securely and only released to the host after your items are confirmed collected.
      </div>
      <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Card number</label>
          <input
            defaultValue="4242 4242 4242 4242"
            readOnly
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
          />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs text-slate-500 block mb-1">Expiry</label>
            <input defaultValue="12/26" readOnly className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" />
          </div>
          <div className="flex-1">
            <label className="text-xs text-slate-500 block mb-1">CVC</label>
            <input defaultValue="123" readOnly className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" />
          </div>
        </div>
      </div>
      <button
        onClick={handleMockPay}
        disabled={status === 'processing' || status === 'success'}
        className="w-full bg-sky-500 hover:bg-sky-600 text-white py-3 rounded-xl font-semibold transition-colors disabled:opacity-60"
      >
        {status === 'processing' ? 'Processing…' : status === 'success' ? 'Paid ✅' : `Pay S$${booking.totalPrice}`}
      </button>
      <p className="text-xs text-slate-400 text-center">
        Demo: using test card <code className="bg-slate-100 px-1 rounded">4242 4242 4242 4242</code>
      </p>
    </div>
  );
}

export function CheckoutWrapper({ booking, onSuccess }) {
  const [clientSecret, setClientSecret] = useState(null);
  const [stripeReady, setStripeReady]   = useState(false);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    loadStripeComponents();
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!pk || pk === 'pk_test_...') {
      setLoading(false);
      return;
    }
    api.createIntent({
      amount_sgd:    booking.totalPrice,
      booking_id:    booking.id,
      host_id:       booking.hostId,
      duration_days: booking.durationDays || 30,
    })
      .then(d => {
        setClientSecret(d.client_secret);
        setStripeReady(!!Elements);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const hasStripe = pk && pk !== 'pk_test_...' && clientSecret && stripeReady && Elements;

  if (!hasStripe) {
    return (
      <MockCheckoutForm
        booking={booking}
        onSuccess={onSuccess}
        onError={() => mascotSay('error', 'Payment failed — want to try again?')}
      />
    );
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
      <RealCheckoutForm booking={booking} onSuccess={onSuccess} />
    </Elements>
  );
}

function RealCheckoutForm({ booking, onSuccess }) {
  const stripe   = useStripe?.();
  const elements = useElements?.();
  const [status, setStatus] = useState('idle');

  const handleSubmit = async () => {
    if (!stripe || !elements) return;
    setStatus('processing');
    const { error } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });
    if (error) {
      setStatus('error');
      mascotSay('error', 'Payment failed — want to try again?');
    } else {
      setStatus('success');
      mascotSay('booking_done', 'All set! Your items are safe with us.');
      api.proactiveTrigger({
        type: 'booking_confirmed',
        user_id: 'demo_user',
        booking: {
          host_name:  booking.hostName,
          address:    booking.address,
          start_date: booking.startDate,
          end_date:   booking.endDate,
          total_sgd:  booking.totalPrice,
          id:         booking.id,
        },
      }).catch(() => {});
      onSuccess?.();
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 rounded-xl p-4 text-sm text-amber-800">
        💳 Payment is held securely and only released to the host after your items are confirmed collected.
      </div>
      {PaymentElement && <PaymentElement />}
      <button
        onClick={handleSubmit}
        disabled={!stripe || status === 'processing'}
        className="w-full bg-sky-500 text-white py-3 rounded-xl font-semibold disabled:opacity-60"
      >
        {status === 'processing' ? 'Processing…' : `Pay S$${booking.totalPrice}`}
      </button>
      <p className="text-xs text-slate-400 text-center">
        Demo: use card <code>4242 4242 4242 4242</code>, any future expiry, any CVC
      </p>
    </div>
  );
}
