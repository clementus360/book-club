export function SomethingWrong({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <p className="text-soft">Nothing you saved has been lost. Please try again in a moment.</p>
      {error.digest && <p className="meta mt-2">Reference: {error.digest}</p>}
      <button className="btn btn-primary mt-5" onClick={reset}>Try again</button>
    </>
  );
}
