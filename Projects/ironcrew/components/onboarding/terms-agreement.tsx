"use client";

export function TermsAgreement({
  agreed,
  onChange,
}: {
  agreed: boolean;
  onChange: (agreed: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <input
        id="terms-agreement"
        type="radio"
        name="terms-agreement"
        value="agree"
        checked={agreed}
        onChange={() => onChange(true)}
        required
        className="mt-0.5 h-4 w-4 shrink-0 accent-slate-950"
      />
      <p>
        <label htmlFor="terms-agreement">I agree to the</label>{" "}
        <a
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium underline underline-offset-2"
        >
          Terms and Conditions
        </a>{" "}
        and{" "}
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium underline underline-offset-2"
        >
          Privacy Policy
        </a>
        .
      </p>
    </div>
  );
}
