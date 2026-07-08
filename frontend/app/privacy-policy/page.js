import Link from "next/link";
import { ArrowLeft, Heart, Lock, ShieldCheck } from "lucide-react";

const policySections = [
  {
    title: "Information We Collect",
    content:
      "Project INAY may collect your name, email address, account details, pregnancy-related learning progress, uploaded medical documents, and information needed to support maternal and child health services.",
  },
  {
    title: "How We Use Your Information",
    content:
      "Your information is used to create your account, provide access to INAY Kaalaman modules, track learning progress, support health-service workflows, and improve maternal, neonatal, and child health support.",
  },
  {
    title: "Medical Records And Uploads",
    content:
      "Uploaded checkup records, prescriptions, laboratory results, and similar documents are treated as sensitive information. They are used only for health-related features and authorized care support within the platform.",
  },
  {
    title: "Data Sharing",
    content:
      "We do not sell your personal information. Information may be shared only with authorized Program Staff, system administrators, or required services when needed to provide care, operate the platform, or comply with applicable rules.",
  },
  {
    title: "Security",
    content:
      "We use reasonable safeguards to protect your account and uploaded information. You should keep your password private and log out when using a shared device.",
  },
  {
    title: "Your Rights",
    content:
      "You may request access, correction, or deletion of your personal information where applicable. For privacy concerns, contact the Project INAY administrator or your assigned Program Staff.",
  },
];

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-[#fafafa] px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/register"
          className="mb-6 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-pink-600 shadow-sm ring-1 ring-pink-100 transition hover:bg-pink-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Register
        </Link>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-md md:p-10">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 shadow-lg">
              <Heart className="h-7 w-7 fill-pink-500 text-pink-500" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">
              Privacy Policy
            </h1>
            <p className="mt-2 text-sm font-bold uppercase tracking-wide text-pink-600">
              Project INAY Data Protection Notice
            </p>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-slate-600">
              This policy explains how Project INAY handles personal and health-related information
              when you create an account and use the platform.
            </p>
          </div>

          <div className="mb-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-pink-100 bg-pink-50 p-4">
              <ShieldCheck className="mb-3 h-6 w-6 text-pink-600" />
              <h2 className="font-extrabold text-slate-950">Protected Health Data</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Health records and prenatal documents are handled as sensitive information.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <Lock className="mb-3 h-6 w-6 text-slate-700" />
              <h2 className="font-extrabold text-slate-950">Account Privacy</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Your account access is protected by your login credentials and platform controls.
              </p>
            </div>
          </div>

          <div className="space-y-5">
            {policySections.map((section) => (
              <div key={section.title} className="rounded-2xl border border-slate-200 p-5">
                <h2 className="text-lg font-extrabold text-slate-950">{section.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{section.content}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-pink-100 bg-pink-50 p-5 text-center">
            <p className="text-sm font-semibold leading-6 text-slate-700">
              By registering, you confirm that you understand and agree to this Privacy Policy.
            </p>
            <Link
              href="/register"
              className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-pink-600 px-5 text-sm font-extrabold text-white transition hover:bg-pink-700"
            >
              Continue Registration
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
