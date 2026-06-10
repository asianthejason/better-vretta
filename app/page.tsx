export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 text-center">
        <p className="mb-4 rounded-full bg-blue-500/10 px-4 py-2 text-sm text-blue-300">
          Math Assessment Builder
        </p>

        <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-6xl">
          Create interactive math assessments for your students.
        </h1>

        <p className="mb-8 max-w-2xl text-lg text-slate-300">
          Build multiple choice questions, drag-and-drop activities, sorting
          questions, and image-based math questions with answer boxes.
        </p>

        <div className="flex flex-col gap-4 sm:flex-row">
          <a
            href="/teacher"
            className="rounded-xl bg-blue-500 px-6 py-3 font-semibold text-white hover:bg-blue-400"
          >
            Teacher Dashboard
          </a>

          <a
            href="/student"
            className="rounded-xl border border-slate-700 px-6 py-3 font-semibold text-slate-200 hover:bg-slate-900"
          >
            Student Assessment
          </a>
        </div>
      </section>
    </main>
  );
}