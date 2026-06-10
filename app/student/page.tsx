export default function StudentPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <a href="/" className="text-sm text-blue-300 hover:underline">
          ← Back home
        </a>

        <h1 className="mt-8 text-4xl font-bold">Student Assessment</h1>

        <p className="mt-4 max-w-2xl text-slate-300">
          This is where students will complete interactive math questions.
        </p>

        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-2xl font-semibold">Sample Question</h2>
          <p className="mt-4 text-slate-300">
            What is the value of 7 × 8?
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {["48", "54", "56", "64"].map((choice) => (
              <button
                key={choice}
                className="rounded-xl border border-slate-700 p-4 text-left hover:bg-slate-800"
              >
                {choice}
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}