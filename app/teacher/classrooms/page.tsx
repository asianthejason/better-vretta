"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { requireAccountRole } from "@/lib/roleGuard";
import { supabase } from "@/lib/supabaseClient";

type Classroom = { id: string; name: string; join_code: string };
type Student = {
  student_id: string;
  profiles: { full_name: string; email: string } | null;
};
type ClassroomTeacher = {
  teacher_id: string;
  is_owner: boolean;
  profiles: { full_name: string; email: string } | null;
};

export default function ClassroomsPage() {
  const [userId, setUserId] = useState("");
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [selected, setSelected] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<ClassroomTeacher[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [teacherEmail, setTeacherEmail] = useState("");
  const [loading, setLoading] = useState(true);

  const selectedClass = classes.find((classroom) => classroom.id === selected);
  const currentTeacherMembership = teachers.find((teacher) => teacher.teacher_id === userId);
  const canManageTeachers = currentTeacherMembership?.is_owner ?? false;

  useEffect(() => {
    void loadBase();
  }, []);

  useEffect(() => {
    if (selected) void loadClass(selected);
  }, [selected]);

  async function loadBase() {
    const user = await requireAccountRole("teacher");
    if (!user) return;
    setUserId(user.id);

    const { data } = await supabase
      .from("classrooms")
      .select("id,name,join_code")
      .order("created_at");

    setClasses(data || []);
    if (data?.[0]) setSelected(data[0].id);
    setLoading(false);
  }

  async function loadClass(id: string) {
    const [{ data: roster }, { data: teacherRows }] = await Promise.all([
      supabase
        .from("classroom_students")
        .select("student_id,profiles(full_name,email)")
        .eq("classroom_id", id),
      supabase
        .from("classroom_teachers")
        .select("teacher_id,is_owner,profiles(full_name,email)")
        .eq("classroom_id", id)
        .order("is_owner", { ascending: false }),
    ]);

    setStudents((roster || []) as unknown as Student[]);
    setTeachers((teacherRows || []) as unknown as ClassroomTeacher[]);
  }

  async function createClass() {
    if (!name.trim()) return;
    const { data, error } = await supabase
      .from("classrooms")
      .insert({ name: name.trim(), teacher_id: userId })
      .select("id,name,join_code")
      .single();

    if (error) return alert(error.message);
    setClasses((current) => [...current, data]);
    setSelected(data.id);
    setName("");
  }

  async function addStudent() {
    if (!selected || !email.trim()) return;
    const { error } = await supabase.rpc("add_student_to_classroom", {
      target_classroom: selected,
      student_email: email.trim(),
    });

    if (error) return alert(error.message);
    setEmail("");
    void loadClass(selected);
  }

  async function addTeacher() {
    if (!selected || !teacherEmail.trim()) return;
    const { error } = await supabase.rpc("add_teacher_to_classroom", {
      target_classroom: selected,
      teacher_email: teacherEmail.trim(),
    });
    if (error) return alert(error.message);
    setTeacherEmail("");
    void loadClass(selected);
  }

  async function removeTeacher(teacher: ClassroomTeacher) {
    const teacherName = teacher.profiles?.full_name || teacher.profiles?.email || "this teacher";
    if (!window.confirm(`Remove ${teacherName} from ${selectedClass?.name}?`)) return;

    const { error } = await supabase.rpc("remove_teacher_from_classroom", {
      target_classroom: selected,
      target_teacher: teacher.teacher_id,
    });
    if (error) return alert(error.message);
    setTeachers((current) => current.filter((item) => item.teacher_id !== teacher.teacher_id));
  }

  async function deleteClassroom() {
    if (!selectedClass) return;
    const confirmed = window.confirm(
      `Delete “${selectedClass.name}”? This will also delete its assessments and student results. This cannot be undone.`
    );
    if (!confirmed) return;

    const { error } = await supabase.from("classrooms").delete().eq("id", selectedClass.id);
    if (error) return alert(error.message);

    const remaining = classes.filter((classroom) => classroom.id !== selectedClass.id);
    setClasses(remaining);
    setSelected(remaining[0]?.id || "");
    setStudents([]);
    setTeachers([]);
  }

  async function removeStudent(student: Student) {
    const studentName = student.profiles?.full_name || student.profiles?.email || "this student";
    if (!window.confirm(`Remove ${studentName} from ${selectedClass?.name}?`)) return;

    const { error } = await supabase
      .from("classroom_students")
      .delete()
      .eq("classroom_id", selected)
      .eq("student_id", student.student_id);
    if (error) return alert(error.message);

    setStudents((current) => current.filter((item) => item.student_id !== student.student_id));
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <nav className="border-b border-slate-200 bg-white" aria-label="Global navigation">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3 font-bold tracking-tight text-slate-950">
            <span className="grid size-9 place-items-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-200">
              J
            </span>
            Jretta
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/teacher"
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
            >
              Dashboard
            </Link>
            <Link
              href="/teacher/classrooms"
              aria-current="page"
              className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
            >
              Classrooms
            </Link>
            <Link
              href="/profile"
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
            >
              Profile
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
            >
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-8 sm:px-8 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="h-fit rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="pb-5">
            <label htmlFor="class-name" className="text-sm font-bold text-slate-800">
              Create a class
            </label>
            <input
              id="class-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void createClass()}
              placeholder="e.g. Biology 10A"
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
            <button
              type="button"
              onClick={() => void createClass()}
              disabled={!name.trim()}
              className="mt-2 w-full rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-extrabold text-white transition hover:!bg-blue-600 hover:shadow-md disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none disabled:hover:!bg-slate-300"
            >
              Create class
            </button>
          </div>

          <div className="border-t border-slate-200 pt-5">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-600">Your classes</h2>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
              {classes.length}
            </span>
          </div>

          <div className="mt-4 space-y-2">
            {classes.map((classroom) => {
              const active = classroom.id === selected;
              return (
                <button
                  key={classroom.id}
                  type="button"
                  onClick={() => setSelected(classroom.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold transition ${
                    active
                      ? "bg-blue-600 text-white shadow-md shadow-blue-200"
                      : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-blue-50 hover:text-blue-800"
                  }`}
                >
                  <span className={`size-2.5 rounded-full ${active ? "bg-white" : "bg-blue-500"}`} />
                  <span className="truncate">{classroom.name}</span>
                </button>
              );
            })}
            {!loading && classes.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm leading-6 text-slate-600">
                Create your first class to begin adding students and assessments.
              </p>
            )}
          </div>
          </div>
        </aside>

        <section className="min-w-0 space-y-6">
          {selectedClass ? (
            <>
              <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-widest text-blue-700">Selected class</p>
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      <h2 className="text-2xl font-black tracking-tight text-slate-950">{selectedClass.name}</h2>
                      <code className="rounded-lg bg-blue-100 px-2.5 py-1 font-mono text-sm font-black tracking-widest text-blue-700">
                        {selectedClass.join_code}
                      </code>
                      <button
                        type="button"
                        onClick={() => void navigator.clipboard.writeText(selectedClass.join_code)}
                        className="rounded-lg px-2.5 py-1 text-xs font-bold text-blue-700 transition hover:bg-blue-100"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                  {canManageTeachers && (
                    <button
                      type="button"
                      onClick={() => void deleteClassroom()}
                      className="shrink-0 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-extrabold text-red-700 transition hover:border-red-300 hover:bg-red-50"
                    >
                      Delete class
                    </button>
                  )}
                </div>

                <div className="p-5 sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h3 className="text-base font-extrabold text-slate-950">Teachers</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {teachers.length} {teachers.length === 1 ? "teacher" : "teachers"} in this class
                      </p>
                    </div>
                    {canManageTeachers && (
                      <div className="flex w-full max-w-md gap-2">
                        <input
                          value={teacherEmail}
                          onChange={(event) => setTeacherEmail(event.target.value)}
                          onKeyDown={(event) => event.key === "Enter" && void addTeacher()}
                          type="email"
                          placeholder="Teacher email address"
                          aria-label="Teacher email address"
                          className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                        />
                        <button
                          type="button"
                          onClick={() => void addTeacher()}
                          disabled={!teacherEmail.trim()}
                          className="shrink-0 rounded-xl border border-blue-700 bg-blue-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-blue-700 hover:shadow-md disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300 disabled:shadow-none"
                        >
                          Add teacher
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200">
                    {teachers.map((teacher) => {
                      const fullName = teacher.profiles?.full_name || "Teacher";
                      return (
                        <div key={teacher.teacher_id} className="flex items-center gap-3 px-4 py-3.5">
                          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-indigo-100 text-sm font-black text-indigo-700">
                            {fullName.charAt(0).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-sm font-extrabold text-slate-900">{fullName}</span>
                              {teacher.is_owner && (
                                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-blue-700">
                                  Owner
                                </span>
                              )}
                            </span>
                            <span className="block truncate text-sm text-slate-600">{teacher.profiles?.email}</span>
                          </span>
                          {canManageTeachers && !teacher.is_owner && (
                            <button
                              type="button"
                              onClick={() => void removeTeacher(teacher)}
                              className="shrink-0 rounded-lg px-3 py-2 text-sm font-bold text-red-600 transition hover:bg-red-50 hover:text-red-700"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-5 flex flex-col gap-4 border-t border-slate-200 pt-5 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h3 className="text-base font-extrabold text-slate-950">Class roster</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {students.length} {students.length === 1 ? "student" : "students"} enrolled
                      </p>
                    </div>
                    <div className="flex w-full max-w-md gap-2">
                      <input
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        onKeyDown={(event) => event.key === "Enter" && void addStudent()}
                        type="email"
                        placeholder="Student email address"
                        aria-label="Student email address"
                        className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      />
                      <button
                        type="button"
                        onClick={() => void addStudent()}
                        disabled={!email.trim()}
                        className="shrink-0 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        Add student
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200">
                    {students.map((student) => {
                      const fullName = student.profiles?.full_name || "Student";
                      return (
                        <div key={student.student_id} className="flex items-center gap-3 px-4 py-3.5">
                          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-blue-100 text-sm font-black text-blue-700">
                            {fullName.charAt(0).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-extrabold text-slate-900">{fullName}</span>
                            <span className="block truncate text-sm text-slate-600">{student.profiles?.email}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => void removeStudent(student)}
                            className="shrink-0 rounded-lg px-3 py-2 text-sm font-bold text-red-600 transition hover:bg-red-50 hover:text-red-700"
                            aria-label={`Remove ${fullName} from class`}
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })}
                    {students.length === 0 && (
                      <p className="px-4 py-8 text-center text-sm leading-6 text-slate-600">
                        No students are enrolled yet. Add one using their Jretta account email.
                      </p>
                    )}
                  </div>
                </div>
              </article>
            </>
          ) : (
            <div className="grid min-h-80 place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <div>
                <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-blue-100 text-2xl font-black text-blue-700">+</span>
                <h2 className="mt-4 text-xl font-black text-slate-950">Create your first class</h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">
                  Your class roster will appear here.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
