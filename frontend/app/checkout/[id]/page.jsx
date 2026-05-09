'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/utils/api';
import { CheckoutWrapper } from '@/components/Checkout/PaymentFlow';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

export default function CheckoutPage() {
  const { id }     = useParams();
  const router     = useRouter();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.bookings()
      .then(d => {
        const bk = (d.bookings || []).find(b => b.id === id);
        if (bk) {
          setBooking({
            id:         bk.id,
            hostId:     bk.host_id,
            hostName:   bk.host_name,
            address:    bk.address,
            totalPrice: bk.total_sgd,
            durationDays: 30,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-slate-500">
        <p className="text-4xl mb-3">🤔</p>
        <p>Booking not found.</p>
        <Link href="/" className="mt-4 text-sky-500 text-sm">← Back home</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 max-w-md mx-auto">
      <header className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <Link href="/bookings" className="text-slate-500 hover:text-slate-700">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="font-semibold text-slate-800">Complete payment</h1>
      </header>
      <main className="p-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-4">
          <p className="font-medium text-slate-800">{booking.hostName}</p>
          <p className="text-sm text-slate-500">{booking.address}</p>
          <p className="text-sky-600 font-bold mt-2">S${booking.totalPrice} / month</p>
        </div>
        <CheckoutWrapper
          booking={booking}
          onSuccess={() => router.push('/bookings')}
        />
      </main>
    </div>
  );
}
