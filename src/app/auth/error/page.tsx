import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-3 px-6 py-24 text-center sm:items-center">
      <h1 className="text-2xl font-medium">Sign-in failed</h1>
      <p className="text-sm text-muted">
        Something went wrong completing sign-in. Try again from the home page.
      </p>
      <Link href="/" className="text-sm underline">
        Back to Recur
      </Link>
    </div>
  );
}
