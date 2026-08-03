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
      onClick={(e) => {
        // Handle the scroll/pulse ourselves instead of letting the browser
        // write #try-it into the URL — a hash in the URL makes the page
        // jump straight to that spot on every future load/reload.
        e.preventDefault();
        window.dispatchEvent(new Event(TRY_IT_EVENT));
      }}
    >
      {children}
    </a>
  );
}
