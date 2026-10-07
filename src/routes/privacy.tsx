import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/legal-page";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Aviso de Privacidade — Trackify" }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage title="Aviso de Privacidade" updated="3 de setembro de 2026">
      <LegalSection title="1. Controladora e contato">
        <p>
          A controladora é 53 063 977 MAYALA KERCIANE SANTOS D, CNPJ 53.063.977/0001-14, Rua
          Pasqualle Gato, Salvador–BA, CEP 41650-470. Solicitações de privacidade e suporte:
          mayalajesus@outsmarting.com.br.
        </p>
      </LegalSection>
      <LegalSection title="2. Dados tratados">
        <p>
          Tratamos identificação e conta (nome, sobrenome, e-mail, foto e identificador),
          preferências, memberships e convites; workspaces, clientes, projetos, tarefas, descrições,
          registros de tempo e valores-hora; além de dados técnicos mínimos de sessão, segurança,
          requisições, falhas e dispositivo. No login Google, recebemos os dados de perfil
          autorizados pelo usuário.
        </p>
      </LegalSection>
      <LegalSection title="3. Finalidades e bases legais">
        <p>
          Usamos os dados para autenticar, executar as funções solicitadas, sincronizar e preservar
          workspaces, prestar suporte, prevenir fraude e abuso, diagnosticar falhas, cumprir
          obrigações legais e exercer direitos. As bases incluem execução do contrato, legítimo
          interesse em segurança e melhoria do serviço, cumprimento legal e, quando aplicável,
          consentimento.
        </p>
      </LegalSection>
      <LegalSection title="4. Operadores e transferências internacionais">
        <p>
          Utilizamos Vercel (hospedagem), Supabase (autenticação, banco e arquivos), Google
          (autenticação), Sentry (diagnóstico de erros sem Replay e sem envio intencional de dados
          pessoais) e GitHub (código, automações e backups criptografados). Esses fornecedores podem
          processar dados fora do Brasil sob contratos e mecanismos de proteção aplicáveis.
        </p>
      </LegalSection>
      <LegalSection title="5. Retenção e exclusão">
        <p>
          Mantemos dados enquanto a conta estiver ativa e pelo período necessário às finalidades
          informadas. Após a solicitação, há uma janela de 30 dias para cancelamento. Na exclusão
          definitiva, removemos conta, workspaces pessoais, timers e mídias próprias. Registros de
          tempo necessários a workspaces compartilhados são pseudonimizados. Cópias em backup
          criptografado expiram em até sete dias.
        </p>
      </LegalSection>
      <LegalSection title="6. Segurança e observabilidade">
        <p>
          Aplicamos controles de acesso por workspace, limites contra abuso, validação de origem,
          criptografia em trânsito, backups cifrados e monitoramento de erros com redução de dados.
          Não usamos Replay, publicidade comportamental ou cookies não essenciais no serviço.
        </p>
      </LegalSection>
      <LegalSection title="7. Seus direitos">
        <p>
          Nos termos da LGPD, você pode solicitar confirmação e acesso, correção, portabilidade,
          informação sobre compartilhamentos, anonimização, bloqueio ou eliminação quando cabível,
          revogação de consentimento e revisão de decisões automatizadas. O app oferece exportação
          JSON e solicitação de exclusão; outras demandas podem ser enviadas ao contato acima.
        </p>
      </LegalSection>
      <LegalSection title="8. Alterações e reclamações">
        <p>
          Mudanças relevantes gerarão uma nova versão para aceite. Você também pode apresentar uma
          petição à Autoridade Nacional de Proteção de Dados (ANPD).
        </p>
      </LegalSection>
    </LegalPage>
  );
}
