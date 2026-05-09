'use client';

import { useState, useEffect } from 'react';
import { api } from '@/utils/api';
import Link from 'next/link';
import { ChevronLeft, Package } from 'lucide-react';

export default function BookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading]  = useState(true);

  useEffect(() => {
    api.bookings()
      .then(d => setBookings(d.bookings || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 max-w-md mx-auto">
      <header className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <Link href="/" className="text-slate-500 hover:text-slate-700">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="font-semibold text-slate-800">My Bookings</h1>
      </header>

      <main className="p-4 space-y-4">
        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && bookings.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <Package size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No bookings yet</p>
            <p className="text-xs mt-1">Scan your room and book your first storage host.</p>
            <Link href="/" className="mt-4 inline-block text-sky-500 text-sm font-medium">
              Get started →
            </Link>
          </div>
        )}

        {bookings.map(bk => (
          <div key={bk.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <p className="font-semibold text-slate-800">{bk.host_name}</p>
                <p className="text-xs text-slate-500">{bk.address}</p>
              </div>
              <span className={`text-xs rounded-full px-2 py-1 font-medium ${
                bk.status === 'active'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-slate-100 text-slate-500'
              }`}>
                {bk.status}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
              <div>
                <p className="text-slate-400">From</p>
                <p className="text-slate-700 font-medium">{bk.start_date}</p>
              </div>
              <div>
                <p className="text-slate-400">Until</p>
                <p className="text-slate-700 font-medium">{bk.end_date}</p>
              </div>
              <div>
                <p className="text-slate-400">Total paid</p>
                <p className="text-sky-600 font-semibold">S${bk.total_sgd}</p>
              </div>
              <div>
                <p className="text-slate-400">Volume</p>
                <p className="text-slate-700 font-medium">{bk.volume_m3} m³</p>
              </div>
            </div>
            {bk.items?.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-50">
                <p className="text-xs text-slate-400 mb-1">Items</p>
                <div className="flex flex-wrap gap-1">
                  {bk.items.map((item, i) => (
                    <span key={i} className="text-xs bg-slate-50 text-slate-600 rounded-full px-2 py-0.5">
                      {item.name || item}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </main>
    </div>
  );
}
