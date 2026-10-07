function escape(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

export function transactionalEmail(kind, payload) {
  const invitation = kind === "invitation";
  const subject = invitation
    ? `Convite para ${payload.workspace} — Trackify`
    : "Boas-vindas ao Trackify";
  const title = invitation ? "Você recebeu um convite" : "Boas-vindas ao Trackify";
  const text = invitation
    ? `${payload.inviter} convidou você para o workspace ${payload.workspace}, como ${payload.role === "Admin" ? "Administrador" : "Membro"}.`
    : `Olá, ${payload.name}! Sua conta está pronta. Crie um workspace ou aceite um convite para começar a registrar seu tempo.`;
  const detail = invitation
    ? `O convite é válido até ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(new Date(payload.expiresAt))} (UTC). Entre ou crie uma conta com o endereço que recebeu este e-mail para aceitar.`
    : "Organize seus projetos, acompanhe suas tarefas e consulte seus relatórios em um só lugar.";
  const action = invitation ? "Aceitar convite" : "Acessar Trackify";
  const footer = invitation
    ? "Se você não reconhece este convite, pode ignorar este e-mail."
    : "Este e-mail foi enviado após o primeiro acesso à sua conta.";
  const url = new URL(payload.url);
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
  )
    throw new Error("Invalid email URL");
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;background:#f5f6f7;font-family:Arial,Helvetica,sans-serif;color:#202124">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:40px 16px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px"><tr><td style="padding:0 0 24px;text-align:center;font-size:20px;font-weight:bold">Trackify</td></tr>
  <tr><td style="background:#fff;border:1px solid #e4e7e9;border-radius:24px;padding:32px 24px">
  <h1 style="margin:0 0 20px;font-size:28px;line-height:36px">${escape(title)}</h1>
  <p style="font-size:16px;line-height:26px">${escape(text)}</p><p style="font-size:14px;line-height:22px;color:#5c636b">${escape(detail)}</p>
  <table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#40c4f4" style="border-radius:24px"><a href="${escape(url.href)}" style="display:inline-block;padding:14px 24px;color:#082430;text-decoration:none;font-weight:bold">${escape(action)}</a></td></tr></table>
  <p style="margin-top:24px;font-size:13px;line-height:21px;color:#5c636b">Se o botão não funcionar, copie e cole este link no navegador:</p>
  <p style="word-break:break-all;font-size:13px"><a style="color:#076487" href="${escape(url.href)}">${escape(url.href)}</a></p>
  <p style="border-top:1px solid #e4e7e9;padding-top:20px;font-size:12px;line-height:20px;color:#5c636b">${escape(footer)}</p>
  </td></tr></table></td></tr></table></body></html>`;
  return {
    subject,
    html,
    text: `${title}\n\n${text}\n\n${detail}\n\n${action}: ${url.href}\n\n${footer}`,
  };
}
