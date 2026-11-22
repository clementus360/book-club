export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="animate-pulse">
      <div className="mb-3 h-4 w-32 bg-rule/70" />
      <div className="mb-8 h-10 w-2/3 max-w-md bg-rule/70 sm:mb-10" />
      <div className="space-y-4 border-t border-rule pt-8">
        <div className="h-24 bg-rule/40" /><div className="h-24 bg-rule/40" /><div className="h-24 bg-rule/40" />
      </div>
    </div>
  );
}
