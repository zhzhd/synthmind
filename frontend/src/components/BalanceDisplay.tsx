import { useEffect, useState } from "react";
import { fetchBalance } from "../lib/api";
import type { BalanceInfo } from "../lib/api";

export default function BalanceDisplay() {
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    try {
      const data = await fetchBalance();
      setBalance(data);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 5 * 60 * 1000); // every 5 min
    return () => clearInterval(iv);
  }, []);

  if (loading) return null;
  if (error || !balance) return null;

  return (
    <div className="balance-display" title={`Balance: ${balance.total_balance} ${balance.currency}`}>
      <span className="balance-dot" data-available={balance.is_available} />
      <span className="balance-amount">{balance.total_balance}</span>
      <span className="balance-currency">{balance.currency}</span>
    </div>
  );
}
