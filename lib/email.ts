import "server-only";

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "Taktik <onboarding@resend.dev>",
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) console.error("Resend error", res.status, await res.text().catch(() => ""));
  return res.ok;
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export function emailLayout(body: string, cta?: { href: string; label: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:system-ui,sans-serif">
  <div style="max-width:520px;margin:24px auto;background:#fff;border-radius:12px;padding:24px;color:#0f172a">
    <div style="font-weight:800;font-size:18px;color:#059669;margin-bottom:16px">taktiks</div>
    ${body}
    ${cta ? `<p style="margin-top:24px"><a href="${cta.href}" style="background:#10b981;color:#0b1020;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(cta.label)}</a></p>` : ""}
    <p style="margin-top:24px;font-size:12px;color:#64748b">You can change email preferences in your taktiks profile.</p>
  </div></body></html>`;
}
