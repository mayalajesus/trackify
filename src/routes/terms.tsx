import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/legal-page";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Termos de Uso — Trackify" }] }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage title="Termos de Uso" updated="3 de setembro de 2026">
      <LegalSection title="1. Responsável pelo serviço">
        <p>
          O Trackify é oferecido por 53 063 977 MAYALA KERCIANE SANTOS D, CNPJ 53.063.977/0001-14,
          com endereço na Rua Pasqualle Gato, Salvador–BA, CEP 41650-470. Contato:
          mayalajesus@outsmarting.com.br.
        </p>
      </LegalSection>
      <LegalSection title="2. Escopo do serviço">
        <p>
          O serviço é atualmente gratuito, não comercial e inicialmente destinado a pessoas no
          Brasil. Recursos podem mudar e poderão ocorrer indisponibilidades. Qualquer oferta paga
          será precedida de termos e infraestrutura compatíveis.
        </p>
      </LegalSection>
      <LegalSection title="3. Conta e segurança">
        <p>
          Você deve fornecer dados corretos, proteger suas credenciais e comunicar acessos não
          autorizados. Cada pessoa deve utilizar sua própria conta. Você é responsável pelas ações
          feitas com uma sessão autenticada sob seu controle.
        </p>
      </LegalSection>
      <LegalSection title="4. Uso aceitável">
        <p>
          É proibido violar leis ou direitos de terceiros, tentar acessar contas ou dados alheios,
          contornar limites de uso, explorar vulnerabilidades, automatizar tráfego abusivo ou usar o
          serviço para distribuir conteúdo malicioso. Podemos limitar ou suspender acessos para
          proteger usuários e a plataforma.
        </p>
      </LegalSection>
      <LegalSection title="5. Workspaces e conteúdo">
        <p>
          O proprietário administra membros, projetos e dados do workspace. Você mantém os direitos
          sobre o conteúdo inserido e concede apenas as permissões técnicas necessárias para
          armazená-lo, processá-lo e exibi-lo no serviço. Não insira dados ilícitos ou informações
          sensíveis desnecessárias em tarefas e descrições.
        </p>
      </LegalSection>
      <LegalSection title="6. Disponibilidade e responsabilidade">
        <p>
          Empregamos medidas razoáveis de segurança e recuperação, mas o serviço não possui garantia
          de disponibilidade contínua. Na extensão permitida pela legislação aplicável, não
          respondemos por perdas indiretas decorrentes de interrupções ou uso inadequado. Nada
          nestes termos limita direitos obrigatórios do consumidor.
        </p>
      </LegalSection>
      <LegalSection title="7. Encerramento e alterações">
        <p>
          Você pode exportar seus dados e solicitar a exclusão da conta. Podemos encerrar o serviço
          ou atualizar estes termos mediante aviso adequado. Uma nova versão relevante exigirá novo
          aceite. A relação é regida pela legislação brasileira, respeitado o foro legalmente
          competente do usuário.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
