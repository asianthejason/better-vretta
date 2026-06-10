export default function TeacherPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <a href="/" className="text-sm text-blue-300 hover:underline">
          ← Back home
        </a>

        <h1 className="mt-8 text-4xl font-bold">Teacher Dashboard</h1>

        <p className="mt-4 max-w-2xl text-slate-300">
          This is where teachers will create assessments, add questions, upload
          images, and review student results.
        </p>

        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-2xl font-semibold">Your Assessments</h2>
          <p className="mt-2 text-slate-400">
            Assessment creation will be added here next.
          </p>
        </div>
      </div>
    </main>
  );
}