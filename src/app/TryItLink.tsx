"use client";

export const TRY_IT_EVENT = "recur:pulse-try-it";

export default function TryItLink({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href="#try-it"
      className={className}
      onClick={() => {
        window.dispatchEvent(new Event(TRY_IT_EVENT));
      }}
    >
      {children}
    </a>
  );
}
