export default function Button({ children, onClick, disabled, active }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        (active
          ? "bg-slate-900 text-white border-slate-900"
          : "bg-white/90 text-slate-700 border-slate-200 hover:bg-white") +
        " rounded-full border px-4 py-2 text-sm font-bold shadow-sm transition active:scale-95 disabled:opacity-40"
      }
    >
      {children}
    </button>
  );
}
