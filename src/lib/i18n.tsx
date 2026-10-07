import { createContext, useContext, useEffect, useMemo } from "react";
import type { ReactNode } from "react";

export type Locale = "en-US" | "pt-BR";

export function getSystemLocale(): Locale {
  if (typeof navigator === "undefined") return "en-US";
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const language of languages) {
    const base = language.toLowerCase().split(/[-_]/)[0];
    if (base === "pt") return "pt-BR";
    if (base === "en") return "en-US";
  }
  return "en-US";
}

export const defaultLocale: Locale = getSystemLocale();

export const localeOptions: Array<{ id: Locale; label: string }> = [
  { id: "en-US", label: "English" },
  { id: "pt-BR", label: "Português (Brasil)" },
];

const ptBR: Record<string, string> = {
  "Saving…": "Salvando…",
  "The recovery link may have expired or already been used. Request a new password reset email.":
    "O link de recuperação pode ter expirado ou já ter sido usado. Solicite um novo e-mail para redefinir sua senha.",
  "Sign in to continue. If confirmation is still required, request another email.":
    "Entre para continuar. Se ainda precisar confirmar seu e-mail, solicite outro envio.",
  "Resend confirmation email": "Reenviar e-mail de confirmação",
  "Didn't receive the confirmation email?": "Não recebeu o e-mail de confirmação?",
  "If confirmation is still required, check the inbox and spam folder for":
    "Se a confirmação ainda for necessária, confira a caixa de entrada e o spam de",
  "Unable to request confirmation. Please try again later.":
    "Não foi possível solicitar a confirmação. Tente novamente mais tarde.",
  "Unable to create your account. Please try again.":
    "Não foi possível criar sua conta. Tente novamente.",
  "Unable to sign in.": "Não foi possível entrar. Confira seus dados e tente novamente.",
  "Unable to update your password. Please try again.":
    "Não foi possível atualizar sua senha. Tente novamente.",
  "This link could not be used": "Não foi possível usar este link",
  "The link may have expired or already been used. Sign in if you have already confirmed your email, or request another link.":
    "O link pode ter expirado ou já ter sido usado. Entre se já confirmou seu e-mail ou solicite outro link.",
  "Choose a new password to continue.": "Escolha uma nova senha para continuar.",
  "Save new password": "Salvar nova senha",
  "Confirm your email before accessing your account.":
    "Confirme seu e-mail antes de acessar sua conta.",
  "Email not confirmed":
    "Confirme seu e-mail antes de entrar. Se necessário, solicite outro e-mail de confirmação.",
  "Email is not verified":
    "Confirme seu e-mail antes de entrar. Se necessário, solicite outro e-mail de confirmação.",
  "Send invitation": "Enviar convite",
  "An invitation email will be sent. You can also copy the private link.":
    "O convite será enviado por e-mail. Você também poderá copiar o link privado.",
  "Invitation created. The email was accepted for sending.":
    "Convite criado. O e-mail foi aceito para envio.",
  "Invitation created, but the email could not be sent. Copy the link or resend the invitation.":
    "Convite criado, mas não foi possível enviar o e-mail. Copie o link ou reenvie o convite.",
  "Invitation created. Email sending could not be confirmed. You can share the link below.":
    "Convite criado. Não foi possível confirmar o envio do e-mail. Você pode compartilhar o link abaixo.",
  "Invitation created. The email is pending. You can share the link below.":
    "Convite criado. O e-mail está pendente. Você pode compartilhar o link abaixo.",
  "Invitation created. Email sending is disabled in this environment. Share the link below.":
    "Convite criado. O envio de e-mail está desativado neste ambiente. Compartilhe o link abaixo.",
  "Favorite tasks": "Tarefas favoritas",
  "Add to favorites": "Adicionar aos favoritos",
  "Remove from favorites": "Remover dos favoritos",
  "Remove {task} from favorites": "Remover {task} dos favoritos",
  "Use favorite {task}, {project}": "Usar favorita {task}, {project}",
  "Project unavailable": "Projeto indisponível",
  "Choose a task and an active project to favorite":
    "Informe uma tarefa e selecione um projeto ativo para favoritar",
  "You can save up to 100 favorite tasks per workspace":
    "Você pode salvar até 100 tarefas favoritas por workspace",
  "Could not update favorites": "Não foi possível atualizar os favoritos",
  Tracker: "Rastreador de tempo",
  Projects: "Projetos",
  Clients: "Clientes",
  Team: "Equipe",
  Reports: "Relatórios",
  Integrations: "Integrações",
  Settings: "Configurações",
  "Go to tracker": "Ir para o rastreador de tempo",
  "Manage projects": "Gerenciar projetos",
  "Manage clients": "Gerenciar clientes",
  "Members and roles": "Membros e funções",
  "Time analytics": "Análise de horas",
  "Trello and more": "Trello e mais",
  "Workspace settings": "Configurações do workspace",
  Navigation: "Navegação",
  Actions: "Ações",
  "Start timer": "Iniciar cronômetro",
  "Stop timer": "Parar cronômetro",
  "Begin tracking now": "Começar a registrar agora",
  "Save the running entry": "Salvar o registro em andamento",
  "Log time manually": "Registrar horas manualmente",
  "Add a past entry": "Adicionar um registro anterior",
  "Global search": "Busca global",
  "Open search results": "Abrir resultados da busca",
  "Open project": "Abrir projeto",
  "Open clients": "Abrir clientes",
  "Search commands, projects, clients…": "Buscar comandos, projetos e clientes…",
  "No results for “{query}”.": "Nenhum resultado para “{query}”.",
  Commands: "Comandos",
  "Navigate with arrow keys": "Navegue com as setas do teclado",
  "to close": "para fechar",
  "Search…": "Buscar…",
  "Search workspace": "Buscar no workspace",
  "Search projects": "Buscar projetos",
  "All projects": "Todos os projetos",
  "No project": "Sem projeto",
  "No client": "Sem cliente",
  "No projects found": "Nenhum projeto encontrado",
  "Previous month": "Mês anterior",
  "Next month": "Próximo mês",
  "Select {label}": "Selecionar {label}",
  "Open {label} calendar": "Abrir calendário de {label}",
  "Choose tracking date range": "Escolher período do rastreador de tempo",
  Today: "Hoje",
  Yesterday: "Ontem",
  "This week": "Esta semana",
  "Last week": "Semana passada",
  "Last 2 weeks": "Últimas 2 semanas",
  "This month": "Este mês",
  "Last month": "Mês passado",
  "This year": "Este ano",
  "Last year": "Ano passado",
  "Custom range": "Período personalizado",
  "Start / End": "Início / fim",
  Duration: "Duração",
  Timer: "Cronômetro",
  End: "Fim",
  Notes: "Observações",
  Billable: "Faturável",
  Internal: "Interno",
  "What are you working on?": "No que você está trabalhando?",
  Start: "Iniciar",
  Pause: "Pausar",
  Resume: "Retomar",
  Stop: "Parar",
  "Timer could not update": "Não conseguimos atualizar o cronômetro",
  "Task is required": "A tarefa é obrigatória",
  "Use H:MM, H:MM:SS, HHMM, HMM, 2h or Ns": "Use H:MM, H:MM:SS, HHMM, HMM, 2h ou Ns",
  "Use H:MM, H:MM:SS, HHMM, HMM, 2h or Ns (for example, 2:45, 00:00:49 or 45s)":
    "Use H:MM, H:MM:SS, HHMM, HMM, 2h ou Ns (por exemplo, 2:45, 00:00:49 ou 45s)",
  "invalid range": "intervalo inválido",
  "Optional details": "Detalhes opcionais",
  "Keep useful context attached to this entry.":
    "Mantenha informações úteis vinculadas a este registro.",
  Cancel: "Cancelar",
  "Save entry": "Salvar registro",
  "Edit time entry": "Editar registro de horas",
  Task: "Tarefa",
  Tasks: "Tarefas",
  "No tasks found": "Nenhuma tarefa encontrada",
  Date: "Data",
  Project: "Projeto",
  "Client: {name}": "Cliente: {name}",
  "Unknown client": "Cliente desconhecido",
  "Duration: {value}": "Duração: {value}",
  "Time entries": "Registros de horas",
  "Time entry deleted": "Registro de horas excluído",
  Undo: "Desfazer",
  "Could not restore entry": "Não conseguimos restaurar este registro",
  "Entry actions": "Ações do registro",
  "Edit entry": "Editar registro",
  "Mark as internal": "Marcar como interno",
  "Mark as billable": "Marcar como faturável",
  "Delete entry": "Excluir registro",
  "Delete time entry?": "Excluir registro de horas?",
  "This removes {task}. You can undo it from the confirmation toast for 20 seconds.":
    "Isto remove {task}. Você pode desfazer pela notificação de confirmação durante 20 segundos.",
  "Tracker period": "Período do rastreador de tempo",
  tracked: "registradas",
  "No time tracked in this period": "Nenhuma hora registrada neste período",
  "Start the timer above or add an entry for a date in this period.":
    "Inicie o cronômetro acima ou adicione um registro para uma data deste período.",
  "Add entry": "Adicionar registro",
  "Previous {unit}": "{unit} anterior",
  "Next {unit}": "Próximo {unit}",
  "Total tracked": "Total registrado",
  "Last activity": "Última atividade",
  "Time tracked per project across the workspace.": "Horas registradas por projeto no workspace.",
  All: "Todos",
  Active: "Ativo",
  Inactive: "Inativo",
  Archived: "Arquivado",
  "New project": "Novo projeto",
  "All clients": "Todos os clientes",
  "All team members": "Todos os membros",
  "Non-billable": "Não faturável",
  "Filter by client": "Filtrar por cliente",
  "Change the filters or create a new project to get started.":
    "Altere os filtros ou crie um projeto para começar.",
  "Create new project": "Criar novo projeto",
  "Edit project": "Editar projeto",
  "Duplicate project": "Duplicar projeto",
  "Project duplicated": "Projeto duplicado",
  "Copy of {name}": "Cópia de {name}",
  "Project updated": "Projeto atualizado",
  "Project color": "Cor do projeto",
  Sky: "Azul-céu",
  Violet: "Violeta",
  Pink: "Rosa",
  Orange: "Laranja",
  Emerald: "Esmeralda",
  Amber: "Âmbar",
  Red: "Vermelho",
  Slate: "Ardósia",
  "No projects here": "Nenhum projeto aqui",
  "Change the status filter or create a new project to get started.":
    "Altere o filtro de status ou crie um novo projeto para começar.",
  "Manage members": "Gerenciar membros",
  "Make internal": "Tornar interno",
  "Make billable": "Tornar faturável",
  "Restore project": "Restaurar projeto",
  "Delete project": "Excluir projeto",
  "Delete project?": "Excluir projeto?",
  "Delete project permanently?": "Excluir projeto permanentemente?",
  "Could not delete project": "Não conseguimos excluir este projeto",
  "This permanently deletes {name} and removes its project link from tracked entries. This action cannot be undone.":
    "Isto exclui {name} permanentemente e remove o vínculo do projeto dos registros de horas. Esta ação não pode ser desfeita.",
  "This permanently deletes {name}. This action cannot be undone.":
    "Isto exclui {name} permanentemente. Esta ação não pode ser desfeita.",
  "Archive project": "Arquivar projeto",
  "Archive project?": "Arquivar projeto?",
  "Could not archive project": "Não conseguimos arquivar este projeto",
  "Existing time entries will remain available in reports and history.":
    "Os registros de horas existentes continuarão disponíveis nos relatórios e no histórico.",
  "This project has tracked time. Keep it archived to preserve reports and history.":
    "Este projeto possui horas registradas. Mantenha-o arquivado para preservar relatórios e histórico.",
  "Project members updated": "Membros do projeto atualizados",
  "Project name is required": "O nome do projeto é obrigatório",
  "e.g. Brand refresh": "ex.: Atualização da marca",
  "Choose a client": "Escolha um cliente",
  "Project created": "Projeto criado",
  "Project deactivated": "Projeto desativado",
  "Project activated": "Projeto ativado",
  "Project restored": "Projeto restaurado",
  "Project marked internal": "Projeto marcado como interno",
  "Project marked billable": "Projeto marcado como faturável",
  "Project archived": "Projeto arquivado",
  "Project deleted": "Projeto excluído",
  "Could not update project": "Não conseguimos atualizar este projeto",
  "Manage the people and companies connected to your projects.":
    "Gerencie as pessoas e empresas ligadas aos seus projetos.",
  "New client": "Novo cliente",
  "Edit client": "Editar cliente",
  "Client updated": "Cliente atualizado",
  "We couldn't update this client": "Não conseguimos atualizar este cliente.",
  "No clients yet": "Ainda não há clientes",
  "Add a client to connect projects and organize tracked time.":
    "Adicione um cliente para vincular projetos e organizar as horas registradas.",
  Contact: "Contato",
  "Client name is required": "O nome do cliente é obrigatório",
  "e.g. Northwind Coffee": "ex.: Café Northwind",
  Optional: "Opcional",
  "Enter a valid email address": "Informe um endereço de e-mail válido",
  "Create client": "Criar cliente",
  "Client created": "Cliente criado",
  "Delete client?": "Excluir cliente?",
  "Could not delete client": "Não conseguimos excluir este cliente",
  "Client cannot be deleted": "O cliente não pode ser excluído",
  "Remove or reassign those projects first.": "Remova ou reatribua esses projetos primeiro.",
  "This permanently removes {name}. Tracked time entries without a direct client relationship remain unchanged.":
    "Isto remove {name} permanentemente. Registros de horas sem vínculo direto com cliente permanecem inalterados.",
  "Delete client": "Excluir cliente",
  "Manage the people and access in this workspace.":
    "Gerencie as pessoas e os acessos deste workspace.",
  "Invite member": "Convidar membro",
  "No team members yet": "Ainda não há membros na equipe",
  "Invite teammates to collaborate on projects and track time together.":
    "Convide colegas para colaborar em projetos e registrar horas juntos.",
  Member: "Membro",
  Admin: "Administrador",
  Owner: "Proprietário",
  Invited: "Convidado",
  Removed: "Removido",
  Email: "E-mail",
  Role: "Função",
  Invite: "Convidar",
  "Invite sent": "Convite enviado",
  "Resend invite": "Reenviar convite",
  "Copy invitation link": "Copiar link do convite",
  "Invitation link created": "Link de convite criado",
  "Invitation link copied": "Link de convite copiado",
  "Invitation link": "Link do convite",
  "Copy link": "Copiar link",
  Done: "Concluir",
  "Choose invitation role": "Escolher função da pessoa convidada",
  "name@company.com": "nome@empresa.com",
  "Copy the invitation link manually.": "Copie o link de convite manualmente.",
  "Create invitation link": "Criar link de convite",
  "A private invitation link will be created for you to share.":
    "Um link privado de convite será criado para você compartilhar.",
  "Share this private link with the invited person. It expires in 7 days.":
    "Compartilhe este link privado com a pessoa convidada. Ele expira em 7 dias.",
  "Email delivery is temporarily limited. Try again later or continue with Google.":
    "O envio de e-mail está temporariamente limitado. Tente novamente mais tarde ou continue com o Google.",
  "Security verification failed. Try again.": "A verificação de segurança falhou. Tente novamente.",
  "Too many requests. Please try again shortly.":
    "Muitas solicitações em pouco tempo. Tente novamente em instantes.",
  "This request origin is not allowed.": "A origem desta solicitação não é permitida.",
  "Accept the current Terms and Privacy Notice to continue.":
    "Aceite os Termos e o Aviso de Privacidade vigentes para continuar.",
  "Your account is scheduled for deletion.": "Sua conta está agendada para exclusão.",
  "Sign in again before requesting account deletion.":
    "Entre novamente antes de solicitar a exclusão da conta.",
  "Transfer ownership of every shared workspace before deleting your account.":
    "Transfira a propriedade de todos os workspaces compartilhados antes de excluir sua conta.",
  "Cancel invite": "Cancelar convite",
  "Remove member": "Remover membro",
  "Restore member": "Restaurar membro",
  "Make admin": "Tornar administrador",
  "Make member": "Tornar membro",
  "Remove team member?": "Remover membro da equipe?",
  "Restore team member?": "Restaurar membro da equipe?",
  "This removes {name} from active workspace access. Their tracked history remains available.":
    "Isto remove {name} do acesso ativo ao workspace. O histórico de horas continua disponível.",
  "This restores {name}'s workspace access. Project assignments will need to be added again.":
    "Isto restaura o acesso de {name} ao workspace. As atribuições de projetos precisarão ser adicionadas novamente.",
  "Could not update team member": "Não conseguimos atualizar este membro da equipe",
  "Team member updated": "Membro da equipe atualizado",
  "Member removed": "Membro removido",
  "Member restored": "Membro restaurado",
  "Inspect every entry with its project, client, person and billability.":
    "Consulte cada registro com projeto, cliente, pessoa e faturamento.",
  "Compare totals with flexible project, client, member, task or date groups.":
    "Compare totais por projeto, cliente, membro, tarefa ou data.",
  "See where tracked time and estimated billable value are concentrated.":
    "Veja onde o tempo registrado e o valor faturável estimado estão concentrados.",
  "Review one complete week across projects or team members.":
    "Revise uma semana completa por projeto ou membro da equipe.",
  "Understand when registered activity happens and how routines change over time.":
    "Entenda quando a atividade registrada acontece e como a rotina muda ao longo do tempo.",
  "Compare time, billing mix and activity across the available team.":
    "Compare horas, composição de faturamento e atividade da equipe.",
  "See tracked time, billability, estimated value and activity distribution.":
    "Veja o tempo registrado, o faturamento, o valor estimado e a distribuição da atividade.",
  Overview: "Visão geral",
  Detailed: "Detalhado",
  Summary: "Resumo",
  Analysis: "Análise",
  Weekly: "Semanal",
  Activity: "Atividade",
  "Tracked time": "Tempo registrado",
  "Billable time": "Tempo faturável",
  "Estimated billable value": "Valor faturável estimado",
  "More information about {label}": "Mais informações sobre {label}",
  "Comparisons use the previous equivalent period.":
    "As comparações usam o período anterior equivalente.",
  "Only entries marked as billable are included in this total.":
    "Somente lançamentos marcados como faturáveis entram neste total.",
  "Average tracked time on days with activity.":
    "Média do tempo registrado nos dias com atividade.",
  "Activity time": "Tempo de atividade",
  "Lines show tracked time and the previous equivalent period.":
    "As linhas mostram o tempo registrado e o período anterior equivalente.",
  "Bars show tracked time across the selected period.":
    "As barras mostram o tempo registrado ao longo do período selecionado.",
  "Bars show tracked time; the line shows the previous equivalent period.":
    "As barras mostram o tempo registrado; a linha mostra o período anterior equivalente.",
  "Lines show tracked time, its trend and the previous equivalent period.":
    "As linhas mostram o tempo registrado, sua tendência e o período anterior equivalente.",
  "Current period": "Período atual",
  "Previous period": "Período anterior",
  Trend: "Tendência",
  Difference: "Diferença",
  "Highest activity period": "Período de maior atividade",
  "Previous period had no activity": "O período anterior não teve atividade",
  "Estimate based on billable time and the hourly-rate snapshot of each entry.":
    "Estimativa baseada no tempo faturável e no snapshot do valor/hora de cada lançamento.",
  Change: "Variação",
  "versus previous period": "em relação ao período anterior",
  "vs. previous period": "vs. período anterior",
  "Estimated billable value by project": "Valor faturável estimado por projeto",
  "Estimated billable value by client": "Valor faturável estimado por cliente",
  "Estimated billable value evolution": "Evolução do valor faturável estimado",
  "Up to six projects, shown in {currency}.": "Até seis projetos, exibidos em {currency}.",
  "Up to six clients, with billable time as supporting information.":
    "Até seis clientes, com o tempo faturável como informação secundária.",
  "Daily, weekly or monthly grouping according to the selected period.":
    "Agrupamento diário, semanal ou mensal conforme o período selecionado.",
  "Select one currency": "Selecione uma moeda",
  "Use the currency filter to compare values on a single axis.":
    "Use o filtro de moeda para comparar valores em um único eixo.",
  "No estimated billable value": "Sem valor faturável estimado",
  "All currencies": "Todas as moedas",
  "Active days": "Dias ativos",
  "Activity evolution": "Evolução da atividade",
  "Billable and internal time over the selected period.":
    "Tempo faturável e interno ao longo do período selecionado.",
  "Hours by shift": "Horas por turno",
  "Top projects": "Principais projetos",
  "Projects with the most tracked time.": "Projetos com mais tempo registrado.",
  "Time composition": "Composição do tempo",
  "Shows how tracked time is split between billable and internal entries.":
    "Mostra como o tempo registrado se divide entre lançamentos faturáveis e internos.",
  "of tracked time is billable": "do tempo registrado é faturável",
  "Billable versus internal time.": "Tempo faturável versus interno.",
  "Activity summary": "Resumo de atividade",
  "Highlights from the selected period.": "Destaques do período selecionado.",
  "Work rhythm": "Ritmo de trabalho",
  "Average session": "Sessão média",
  "Longest session": "Maior sessão",
  Consistency: "Consistência",
  "Peak day": "Dia de pico",
  "Consistency is the share of selected days with registered activity.":
    "Consistência é a proporção dos dias selecionados com atividade registrada.",
  "No currency conversion applied.": "Nenhuma conversão de moeda foi aplicada.",
  "Average {value} per active day": "Média de {value} por dia ativo",
  "No comparison": "Sem comparação",
  "No change": "Sem alteração",
  "No change from previous period": "Sem alteração em relação ao período anterior",
  "more than previous period": "a mais que no período anterior",
  "less than previous period": "a menos que no período anterior",
  "No activity": "Sem atividade",
  "No chart data": "Sem dados para o gráfico",
  "Chart legend": "Legenda do gráfico",
  Overnight: "Madrugada",
  Morning: "Manhã",
  Afternoon: "Tarde",
  Night: "Noite",
  "Predominant shift": "Turno predominante",
  "Predominant shift: {shift}": "Turno predominante: {shift}",
  Predominant: "Predominante",
  "Registered activity": "Atividade registrada",
  "Registered activity by time of day.": "Atividade registrada por período do dia.",
  "Shift evolution": "Evolução dos turnos",
  "Registered activity across shifts over the selected period.":
    "Atividade registrada por turno ao longo do período selecionado.",
  "Activity by weekday": "Atividade por dia da semana",
  "Average registered activity": "Média de atividade registrada",
  "Average registered activity for each weekday.":
    "Média de atividade registrada para cada dia da semana.",
  "At least two weeks are needed": "São necessárias pelo menos duas semanas",
  "Select a period of at least 14 days to see weekday averages.":
    "Selecione um período de pelo menos 14 dias para ver as médias por dia da semana.",
  "Weekdays versus weekends": "Dias úteis versus finais de semana",
  Weekdays: "Dias úteis",
  Weekends: "Finais de semana",
  "Registered activity and average per active day.": "Atividade registrada e média por dia ativo.",
  "per active day": "por dia ativo",
  "Characteristic times": "Horários característicos",
  "Registered activity times; these are not a productivity measure.":
    "Horários da atividade registrada; estes dados não medem produtividade.",
  "Average start": "Horário médio de início",
  "Average end": "Horário médio de término",
  "Earliest start": "Primeiro início do período",
  "Latest end": "Término mais tardio",
  "Weekly matrix": "Matriz semanal",
  "Seven-day registered activity grouped by project or member.":
    "Atividade registrada em sete dias, agrupada por projeto ou membro.",
  "Top groups by time": "Principais grupos por tempo",
  "Groups with the highest concentration of tracked time.":
    "Grupos com a maior concentração de tempo registrado.",
  "Top group share": "Participação do principal grupo",
  "{value} percentage points versus the previous period":
    "{value} pontos percentuais em relação ao período anterior",
  "Billing by group": "Cobrança por grupo",
  "Billable and internal time within each leading group.":
    "Tempo faturável e interno em cada grupo principal.",
  "Estimated billable value by group": "Valor faturável estimado por grupo",
  "Values shown in {currency}.": "Valores exibidos em {currency}.",
  "Multiple currencies cannot be compared on the same axis.":
    "Múltiplas moedas não podem ser comparadas no mesmo eixo.",
  "No estimated billable value in the selected period.":
    "Não há valor faturável estimado no período selecionado.",
  "Totals remain separated by currency; no conversion is applied.":
    "Os totais permanecem separados por moeda; nenhuma conversão é aplicada.",
  "Complete analysis": "Análise completa",
  "All groups in the selected hierarchy.": "Todos os grupos da hierarquia selecionada.",
  "Billable percentage": "Percentual faturável",
  "Average entry duration": "Duração média por lançamento",
  "Detailed entries": "Lançamentos detalhados",
  "Detailed report": "Relatório detalhado",
  Billing: "Faturamento",
  View: "Visualização",
  Grouping: "Agrupamento",
  Subgroup: "Subgrupo",
  Day: "Dia",
  Week: "Semana",
  Month: "Mês",
  "Shift analysis": "Análise por turno",
  "Time by member": "Tempo por membro",
  "Up to eight members, ordered by registered activity.":
    "Até oito membros, ordenados pela atividade registrada.",
  "Billable percentage by member": "Percentual faturável por membro",
  "Billable duration is shown with each percentage.":
    "A duração faturável é exibida com cada percentual.",
  "Estimated billable value by member": "Valor faturável estimado por membro",
  "Currencies are shown in separate groups and are never combined.":
    "As moedas são exibidas em grupos separados e nunca são somadas.",
  "Members are compared only within the same currency.":
    "Os membros são comparados somente dentro da mesma moeda.",
  "Team share": "Participação da equipe",
  "Share represents only the distribution of registered activity.":
    "A participação representa somente a distribuição da atividade registrada.",
  "This member accounts for the largest share of registered activity in the period.":
    "Este membro concentra a maior participação na atividade registrada do período.",
  "Active days and daily average": "Dias ativos e média diária",
  "Comparison of registered activity by active day.":
    "Comparação da atividade registrada por dia ativo.",
  "Average per active day": "Média por dia ativo",
  "active days": "dias ativos",
  "Complete team activity": "Atividade completa da equipe",
  "All members in the current report scope.": "Todos os membros no escopo atual do relatório.",
  "Team reports are available only to Admins and the Owner.":
    "Os relatórios de equipe estão disponíveis somente para Administradores e o Proprietário.",
  "Team report unavailable": "Relatório de equipe indisponível",
  "Only Admins and the Owner can view team reports.":
    "Somente Administradores e o Proprietário podem visualizar relatórios de equipe.",
  "Go to overview": "Ir para a Visão geral",
  "Busiest day": "Dia com maior atividade",
  "Top project": "Principal projeto",
  "Time without project": "Tempo sem projeto",
  "of tracked time": "do tempo registrado",
  Metric: "Métrica",
  Value: "Valor",
  "Report filters": "Filtros do relatório",
  "Clear filters": "Limpar filtros",
  "No records match the selected filters.": "Nenhum registro corresponde aos filtros selecionados.",
  "Export report": "Exportar relatório",
  Export: "Exportar",
  Close: "Fechar",
  "Included data": "Dados incluídos",
  "Ready to export: {count} records.": "Pronto para exportar: {count} registros.",
  "This export uses the current period, filters, permission scope, report view and grouping ({count} rows).":
    "Esta exportação usa o período, os filtros, o escopo de permissão, a visualização e o agrupamento atuais ({count} linhas).",
  Format: "Formato",
  "Export started": "Exportação iniciada",
  "A print-ready report opened for printing or saving as PDF.":
    "Um relatório pronto para impressão foi aberto para imprimir ou salvar como PDF.",
  "The filtered {format} report is downloading.":
    "O relatório filtrado em {format} está sendo baixado.",
  "Export prepared": "Exportação preparada",
  "The print window is ready. Choose Save as PDF in the browser print dialog.":
    "A janela de impressão está pronta. Escolha Salvar como PDF no diálogo de impressão do navegador.",
  "The file uses the same filtered dataset shown in this report.":
    "O arquivo usa o mesmo conjunto de dados filtrado exibido neste relatório.",
  "Export unavailable": "Exportação indisponível",
  "Bring tasks from the tools you already use.": "Traga tarefas das ferramentas que você já usa.",
  "Import cards from your boards and start timers straight from a card.":
    "Importe cartões dos seus quadros e inicie cronômetros diretamente de um cartão.",
  disconnected: "desconectado",
  connecting: "conectando",
  connected: "conectado",
  syncing: "sincronizando",
  synced: "sincronizado",
  error: "erro",
  "reconnect-required": "reconexão necessária",
  "last sync": "última sincronização",
  never: "nunca",
  "Connect Trello": "Conectar Trello",
  "Sync now": "Sincronizar agora",
  Search: "Busca",
  "Look across projects, clients, team and entries.":
    "Busque em projetos, clientes, equipe e registros.",
  "No matches": "Nenhum resultado",
  "Start typing": "Comece a digitar",
  "Try another keyword or check the spelling.": "Tente outra palavra-chave ou confira a grafia.",
  "Results appear as you type.": "Os resultados aparecem enquanto você digita.",
  "Workspace preferences and defaults.": "Preferências e padrões do workspace.",
  "Manage your account, personal preferences and workspace defaults.":
    "Gerencie sua conta, preferências pessoais e padrões do workspace.",
  "Manage your account and personal preferences.":
    "Gerencie sua conta e suas preferências pessoais.",
  Account: "Conta",
  "Manage your profile and account details.": "Gerencie seu perfil e os dados da sua conta.",
  "A first name is required.": "O nome é obrigatório.",
  "A last name is required.": "O sobrenome é obrigatório.",
  "Name must be 120 characters or fewer.": "O nome deve ter no máximo 120 caracteres.",
  "First name": "Nome",
  "Last name": "Sobrenome",
  "Your first name": "Seu nome",
  "Your last name": "Seu sobrenome",
  "Save account": "Salvar conta",
  "Account settings saved": "Configurações da conta salvas",
  Password: "Senha",
  "Confirm password": "Confirmar senha",
  "Leave blank to keep your current password.": "Deixe em branco para manter sua senha atual.",
  "Repeat your new password.": "Repita sua nova senha.",
  "Could not save account": "Não conseguimos salvar sua conta",
  "The current account could not be loaded.": "Não conseguimos carregar sua conta agora.",
  "Defaults shared by everyone in the workspace.": "Padrões compartilhados por todos no workspace.",
  "Workspace name": "Nome do workspace",
  "Workspace name is required": "O nome do workspace é obrigatório",
  "Workspace name is required.": "O nome do workspace é obrigatório.",
  "Billable by default": "Faturável por padrão",
  "New entries start marked as billable.": "Novos registros começam marcados como faturáveis.",
  "Week starts on": "A semana começa no",
  Monday: "segunda-feira",
  Sunday: "domingo",
  "Save workspace settings": "Salvar configurações do workspace",
  "Could not save workspace settings": "Não conseguimos salvar as configurações do workspace",
  "Workspace settings saved": "Configurações do workspace salvas",
  "Personal preferences": "Preferências pessoais",
  Preferences: "Preferências",
  "These preferences apply only to your account.":
    "Estas preferências se aplicam somente à sua conta.",
  "Idle detection": "Detecção de inatividade",
  "Ask whether to pause the timer after long inactivity.":
    "Pergunte se o timer deve ser pausado após um longo período de inatividade.",
  "You were inactive. Would you like to pause the timer?":
    "Você ficou inativo. Deseja pausar o timer?",
  "Pause timer": "Pausar timer",
  "Continue working": "Continuar trabalhando",
  Language: "Idioma",
  "Choose the language for your account.": "Escolha o idioma da sua conta.",
  "Preferences saved": "Preferências salvas",
  "Could not save personal preferences": "Não conseguimos salvar suas preferências",
  "Workspace settings are managed by Admins and the Owner.":
    "As configurações do workspace são gerenciadas por Administradores e pelo Proprietário.",
  "This page didn't load": "Não conseguimos carregar esta página",
  "Something went wrong on our end. You can try refreshing or head back home.":
    "Não conseguimos carregar esta página. Tente novamente ou volte para o início.",
  "Try again": "Tentar novamente",
  "Go home": "Voltar ao início",
  "Page not found": "Página não encontrada",
  "The page you're looking for doesn't exist or has been moved.":
    "A página que você procura não existe ou foi movida.",
  "Loading Trackify…": "Carregando o Trackify…",
  "Loading data": "Carregando dados",
  "Preparing your workspace…": "Preparando seu workspace…",
  "Trackify could not load: {error}": "Não conseguimos carregar o Trackify: {error}",
  "Only Admins and the Owner can change workspace settings.":
    "Somente Administradores e o Proprietário podem alterar as configurações do workspace.",
  "Choose a valid default billability setting.":
    "Escolha uma configuração válida de faturamento padrão.",
  "Choose a valid week start.": "Escolha um início de semana válido.",
  "Choose an active account.": "Escolha uma conta ativa.",
  "Wait for workspace creation to finish.": "Aguarde a conclusão da criação do workspace.",
  "Could not save your pending changes.": "Não foi possível salvar suas alterações pendentes.",
  "Your account session changed. Try again.": "A sessão da sua conta mudou. Tente novamente.",
  "The server returned an invalid response.": "O servidor retornou uma resposta inválida.",
  "Choose an active account in this workspace.": "Escolha uma conta ativa neste workspace.",
  "Stop the active timer before changing accounts.":
    "Pare o cronômetro ativo antes de trocar de conta.",
  "Account selection could not be saved.": "Não conseguimos salvar a conta escolhida.",
  "Stop the active timer before adding time manually.":
    "Pare o cronômetro ativo antes de adicionar horas manualmente.",
  "Stop the active timer before starting another one.":
    "Pare o cronômetro ativo antes de iniciar outro.",
  "Your account cannot track time.": "Esta conta ainda não pode registrar horas.",
  "Your account cannot update the active timer.":
    "Esta conta não pode atualizar o cronômetro ativo.",
  "There is no active timer to update.": "Ainda não há um cronômetro ativo para atualizar.",
  "A task is required.": "Uma tarefa é obrigatória.",
  "Select a project before starting the timer.": "Selecione um projeto antes de iniciar o timer.",
  "Enter a task name and select a project before starting.":
    "Informe o nome da tarefa e selecione um projeto antes de iniciar.",
  "There is no paused timer to resume.": "Não há timer pausado para retomar.",
  "Select a project": "Selecione um projeto",
  "Billing rate": "Valor da hora",
  "Hourly rate": "Valor-hora",
  Currency: "Moeda",
  "Choose currency": "Escolher moeda",
  "Hourly rate is required.": "O valor-hora é obrigatório.",
  "Hourly rate must be zero or greater.": "O valor-hora deve ser maior ou igual a zero.",
  "Enter a valid hourly rate with up to two decimal places.":
    "Digite um valor-hora válido com até duas casas decimais.",
  "Billable value is calculated from billable hours only. No currency conversion is applied.":
    "O valor faturável considera apenas horas faturáveis. Nenhuma conversão cambial é aplicada.",
  "Billable value": "Valor faturável",
  "Overlapping time": "Horários sobrepostos",
  "This entry overlaps another.": "Este lançamento se sobrepõe a outro.",
  "Save anyway": "Salvar mesmo assim",
  "This time overlaps another entry. It was saved anyway.":
    "Este horário se sobrepõe a outro registro. Ele foi salvo mesmo assim.",
  "Choose an existing project or No project.": "Escolha um projeto existente ou Sem projeto.",
  "This project is not assigned to your team member.":
    "Este projeto ainda não está atribuído a este membro da equipe.",
  "This project is archived and cannot be used to start a timer.":
    "Este projeto está arquivado e não pode ser usado para iniciar um timer.",
  "This project is inactive and cannot be used to start a timer.":
    "Este projeto está inativo e não pode ser usado para iniciar um timer.",
  "Choose a valid date.": "Escolha uma data válida.",
  "Choose a valid end date.": "Escolha uma data final válida.",
  "End date cannot be before the start date.": "A data final não pode ser anterior à data inicial.",
  "End time must be after start time.": "O horário final deve ser posterior ao inicial.",
  "Duration must match the selected time range.":
    "A duração deve corresponder ao intervalo selecionado.",
  "You can only create your own time entries.":
    "Você só pode criar seus próprios registros de horas.",
  "You can only edit your own time entries.":
    "Você só pode editar seus próprios registros de horas.",
  "You can only delete your own time entries.":
    "Você só pode excluir seus próprios registros de horas.",
  "This time entry no longer exists.": "Este registro de horas não está mais disponível.",
  "This time entry already exists.": "Este registro de horas já existe.",
  "You can only restore your own time entries.":
    "Você só pode restaurar seus próprios registros de horas.",
  "Only Admins and the Owner can manage projects.":
    "Somente Administradores e o Proprietário podem gerenciar projetos.",
  "A project name is required.": "O nome do projeto é obrigatório.",
  "A project with this name already exists for this client.":
    "Já existe um projeto com este nome para este cliente.",
  "Choose an existing client for this project.": "Escolha um cliente existente para este projeto.",
  "Choose whether this project is billable.": "Escolha se este projeto é faturável.",
  "You cannot assign members to projects.": "Você não pode atribuir membros a projetos.",
  "Only active members can be assigned to a project.":
    "Somente membros ativos podem ser atribuídos a um projeto.",
  "This project no longer exists.": "Este projeto não está mais disponível.",
  "Archive the project before deleting it.": "Arquive o projeto antes de excluí-lo.",
  "Stop the active timer before deleting a project.":
    "Pare o cronômetro ativo antes de excluir um projeto.",
  "A project must keep a valid client.": "Um projeto deve manter um cliente válido.",
  "Only Admins and the Owner can manage clients.":
    "Somente Administradores e o Proprietário podem gerenciar clientes.",
  "A client name is required.": "O nome do cliente é obrigatório.",
  "This client no longer exists.": "Este cliente não está mais disponível.",
  "Only Admins and the Owner can invite members.":
    "Somente Administradores e o Proprietário podem convidar membros.",
  "Enter a valid email address.": "Informe um endereço de e-mail válido.",
  "Choose a valid invite role.": "Escolha uma função de convite válida.",
  "Only the Owner can invite Admins.": "Somente o Proprietário pode convidar Administradores.",
  "This member already has access or an invitation.": "Este membro já tem acesso ou um convite.",
  "Only Admins and the Owner can manage invitations.":
    "Somente Administradores e o Proprietário podem gerenciar convites.",
  "This invitation no longer exists.": "Este convite não existe mais.",
  "Only pending invitations can be resent.": "Somente convites pendentes podem ser reenviados.",
  "Only the Owner can manage Admin invitations.":
    "Somente o Proprietário pode gerenciar convites de Administradores.",
  "Only pending invitations can be canceled.": "Somente convites pendentes podem ser cancelados.",
  "Only Admins and the Owner can remove members.":
    "Somente Administradores e o Proprietário podem remover membros.",
  "The Owner cannot remove their own account.": "O Proprietário não pode remover a própria conta.",
  "Only active members can be removed.": "Somente membros ativos podem ser removidos.",
  "The workspace owner cannot be removed.": "O proprietário do workspace não pode ser removido.",
  "Only the Owner can remove Admins.": "Somente o Proprietário pode remover Administradores.",
  "The last admin cannot be removed.": "O último Administrador não pode ser removido.",
  "Only Admins and the Owner can restore members.":
    "Somente Administradores e o Proprietário podem restaurar membros.",
  "Only removed members can be restored.": "Somente membros removidos podem ser restaurados.",
  "Only the Owner can restore Admins.": "Somente o Proprietário pode restaurar Administradores.",
  "This team member no longer exists.": "Este membro da equipe não está mais disponível.",
  "The Owner cannot change their own role.": "O Proprietário não pode alterar a própria função.",
  "The workspace owner role cannot be changed.":
    "A função do proprietário do workspace não pode ser alterada.",
  "Choose a valid team role.": "Escolha uma função de equipe válida.",
  "Admins can only manage Members.": "Administradores só podem gerenciar Membros.",
  "Only Admins and the Owner can change roles.":
    "Somente Administradores e o Proprietário podem alterar funções.",
  "Admins can only promote active Members.": "Administradores só podem promover Membros ativos.",
  "Only the Owner can reassign Admin roles.":
    "Somente o Proprietário pode reatribuir funções de Administrador.",
  "The last admin cannot be reassigned.": "O último Administrador não pode ser reatribuído.",
  "Only Admins and the Owner can manage integrations.":
    "Somente Administradores e o Proprietário podem gerenciar integrações.",
  "Toggle sidebar": "Alternar barra lateral",
  Theme: "Tema",
  System: "Sistema",
  Light: "Claro",
  Dark: "Escuro",
  "Follow your device theme.": "Seguir o tema do seu dispositivo.",
  "Always use the light theme.": "Usar sempre o tema claro.",
  "Always use the dark theme.": "Usar sempre o tema escuro.",
  "Choose how Trackify should look for your account.":
    "Escolha a aparência do Trackify para sua conta.",
  "Open account menu for {name}": "Abrir o menu da conta de {name}",
  "Change profile photo": "Alterar foto de perfil",
  "Remove profile photo": "Remover foto de perfil",
  "Profile photo updated": "Foto de perfil atualizada",
  "Profile photo removed": "Foto de perfil removida",
  "Could not save profile photo: {error}": "Não conseguimos salvar sua foto de perfil: {error}",
  "Could not remove profile photo: {error}": "Não conseguimos remover sua foto de perfil: {error}",
  "Choose a JPG, PNG, WebP or GIF image.": "Escolha uma imagem JPG, PNG, WebP ou GIF.",
  "Profile photos must be smaller than 1 MB.": "As fotos de perfil devem ter menos de 1 MB.",
  "The profile photo could not be read.":
    "Não conseguimos ler a foto de perfil. Tente outra imagem.",
  "Sign out": "Sair da conta",
  "Could not sign out: {error}": "Não conseguimos sair da conta: {error}",
  "You are signed out": "Você saiu da conta",
  "Choose an account to continue.": "Escolha uma conta para continuar.",
  "Could not continue": "Não conseguimos continuar",
  Continue: "Continuar",
  "No accounts available.": "Nenhuma conta disponível.",
  "Sign in to change accounts.": "Entre novamente para alternar de conta.",
  "The session could not be ended.": "Não conseguimos encerrar a sessão.",
  Collapse: "Recolher",
  Expand: "Expandir",
  "Mobile navigation": "Navegação móvel",
  "Something went wrong": "Não conseguimos concluir esta ação",
  "We couldn't load this data. Check your connection and try again.":
    "Não foi possível carregar estes dados. Verifique sua conexão e tente novamente.",
  breadcrumb: "trilha de navegação",
  More: "Mais",
  "Previous slide": "Slide anterior",
  "Next slide": "Próximo slide",
  pagination: "paginação",
  "Go to previous page": "Ir para a página anterior",
  "Go to next page": "Ir para a próxima página",
  "More pages": "Mais páginas",
  Sidebar: "Barra lateral",
  "Displays the mobile sidebar.": "Exibe a barra lateral móvel.",
  "Toggle Sidebar": "Alternar barra lateral",
  "Time entries for selected period": "Registros de horas do período selecionado",
  "Open period calendar: {label}": "Abrir calendário do período: {label}",
  week: "semana",
  day: "dia",
  range: "período",
  "Could not start timer": "Não conseguimos iniciar o cronômetro",
  "Start {task} again": "Iniciar {task} novamente",
  "Actions for {task}": "Ações para {task}",
  "Actions for {task} group": "Ações para o grupo {task}",
  "Collapse group": "Recolher grupo",
  "Expand group": "Expandir grupo",
  "Duplicate entry": "Duplicar registro",
  "Entry duplicated": "Registro duplicado",
  "We couldn't duplicate this time entry": "Não conseguimos duplicar este registro de horas",
  "{count} entry": "{count} registro",
  "{count} entries": "{count} registros",
  billable: "faturável",
  internal: "interno",
  "next day": "dia seguinte",
  "{count} days later": "{count} dias depois",
  "Billable: {value}": "Faturável: {value}",
  yes: "sim",
  no: "não",
  "Start time": "Horário inicial",
  "End time": "Horário final",
  "Start time: {time}": "Horário inicial: {time}",
  "Add a note": "Adicionar uma observação",
  "Edit description": "Editar descrição",
  "Add description": "Adicionar descrição",
  "H:MM": "H:MM",
  "Delete “{task}”? This action cannot be undone.":
    "Excluir “{task}”? Esta ação não pode ser desfeita.",
  "Keep entry": "Manter registro",
  "Time entry updated": "Registro de horas atualizado",
  "Time entry added": "Registro de horas adicionado",
  "Could not save entry": "Não conseguimos salvar este registro",
  "Manual entry unavailable": "Não conseguimos adicionar este registro manual",
  "e.g. Landing page revisions": "ex.: Revisões da página inicial",
  "e.g. 2:45, 00:00:49 or 45s": "ex.: 2:45, 00:00:49 ou 45s",
  "Time entry mode": "Modo do registro de horas",
  "Choose a valid date": "Escolha uma data válida",
  "End time must be after start time": "O horário final deve ser posterior ao inicial",
  "Show validation error": "Mostrar erro de validação",
  "Use H:MM, H:MM:SS, HHMM, HMM, 2h or Ns (for example, 1:20, 00:00:49, 120, 825 or 45s).":
    "Use H:MM, H:MM:SS, HHMM, HMM, 2h ou Ns (por exemplo, 1:20, 00:00:49, 120, 825 ou 45s).",
  Name: "Nome",
  Tracked: "Registrado",
  Time: "Horário",
  "Project / client": "Projeto / cliente",
  "Filter projects": "Filtrar projetos",
  "Select a client": "Selecione um cliente",
  "Every project is connected to one client.": "Todo projeto está vinculado a um cliente.",
  "New entries use this as their default.": "Novos registros usarão esta opção por padrão.",
  "Project members": "Membros do projeto",
  "Only assigned members can track time on this project.":
    "Somente membros atribuídos podem registrar horas neste projeto.",
  "Assign {name}": "Atribuir {name}",
  "Create project": "Criar projeto",
  "Manage project members": "Gerenciar membros do projeto",
  "Could not update members": "Não conseguimos atualizar os membros",
  "Select the active members who can track time on {name}.":
    "Selecione os membros ativos que podem registrar horas em {name}.",
  "Add project members": "Adicionar membros ao projeto",
  "Add members": "Adicionar membros",
  "Search members": "Buscar membros",
  "Active members": "Membros ativos",
  "No matching active members": "Nenhum membro ativo encontrado",
  "Selected members": "Membros selecionados",
  "No members selected": "Nenhum membro selecionado",
  "Remove {name}": "Remover {name}",
  "Save members": "Salvar membros",
  "{name} will leave Active and Inactive lists. Existing time entries will remain available in reports and history.":
    "{name} sairá das listas Ativo e Inativo. Os registros existentes continuarão disponíveis nos relatórios e no histórico.",
  "This project": "Este projeto",
  "Could not create project": "Não conseguimos criar este projeto",
  "This client": "Este cliente",
  "this client": "este cliente",
  "{name} is connected to {count} project{suffix}. Remove or reassign those projects first.":
    "{name} está conectado a {count} projeto{suffix}. Remova ou reatribua esses projetos primeiro.",
  "Invite teammates, manage roles and tracked hours.":
    "Convide colegas, gerencie funções e acompanhe as horas registradas.",
  "Team members": "Membros da equipe",
  "Invitation pending": "Convite pendente",
  "Access removed": "Acesso removido",
  "Actions for invitation to {email}": "Ações do convite para {email}",
  "No actions available for your account": "Nenhuma ação disponível para sua conta",
  "Invitation prepared": "Convite preparado",
  "Could not refresh invitation": "Não conseguimos atualizar este convite",
  "Invitation refreshed": "Convite atualizado",
  "Invitation canceled": "Convite cancelado",
  "Could not restore access": "Não conseguimos restaurar o acesso",
  "Access restored": "Acesso restaurado",
  "{email} no longer has access to the workspace.": "{email} não tem mais acesso ao workspace.",
  "Could not change role": "Não conseguimos alterar essa função",
  "Role updated": "Função atualizada",
  "Could not prepare invitation": "Não conseguimos preparar este convite",
  "Email is required": "O e-mail é obrigatório",
  "This email is already part of the team": "Este e-mail já faz parte da equipe",
  "The invitation will be prepared for future delivery.":
    "O convite será preparado para envio futuro.",
  "Invitation role": "Função do convite",
  "Owner access is reserved for the workspace owner.":
    "O acesso de Proprietário é reservado ao proprietário do workspace.",
  "Prepare invite": "Preparar convite",
  "The pending invitation for {email} will be removed from the team list.":
    "O convite pendente para {email} será removido da equipe.",
  "Keep invitation": "Manter convite",
  "Cancel invitation": "Cancelar convite",
  "Removing {name} revokes workspace access and removes them from current project assignments. Their tracked time and reports remain available. Restoring access later will not reassign projects automatically.":
    "Remover {name} revoga o acesso ao workspace e remove a pessoa das atribuições atuais de projetos. As horas e relatórios continuam disponíveis. Restaurar o acesso depois não reatribuirá projetos automaticamente.",
  "Keep member": "Manter membro",
  "Remove from team": "Remover da equipe",
  "Project not found": "Projeto não encontrado",
  "This project may have been archived or removed.":
    "Este projeto pode ter sido arquivado ou removido.",
  "Back to projects": "Voltar aos projetos",
  "{client} · updated {date}": "{client} · atualizado em {date}",
  Members: "Membros",
  "No time tracked": "Nenhuma hora registrada",
  "Entries logged against this project will appear here.":
    "Os registros deste projeto aparecerão aqui.",
  'Search for "{query}"': 'Buscar por "{query}"',
  "Command menu search": "Busca do menu de comandos",
  "Date range: {range}": "Período: {range}",
  "Date range": "Período",
  "Date range preset": "Predefinição do período",
  "Date range presets": "Predefinições do período",
  "Report period": "Período do relatório",
  "Selected report period": "Período selecionado do relatório",
  "Report period navigation": "Navegação do período do relatório",
  "Report views": "Visualizações do relatório",
  "Choose report date range": "Escolher período do relatório",
  Columns: "Colunas",
  "Choose columns": "Escolher colunas",
  "{label} filter": "Filtro de {label}",
  "{label} options": "Opções de {label}",
  "Search {label} options": "Buscar opções de {label}",
  "Search {label}...": "Buscar {label}...",
  "No results": "Nenhum resultado",
  Filters: "Filtros",
  "Scroll horizontally to see all columns": "Role horizontalmente para ver todas as colunas",
  "Detailed report table": "Tabela detalhada do relatório",
  "Summary report table": "Tabela resumida do relatório",
  "Weekly report table": "Tabela semanal do relatório",
  "Team report table": "Tabela da equipe do relatório",
  "Description filter": "Filtro de descrição",
  "All billability": "Todo faturamento",
  "Clear active report filters": "Limpar filtros ativos do relatório",
  "Report totals": "Totais do relatório",
  "No time entries match": "Nenhum registro corresponde",
  "Try a wider period or clear one of the active filters.":
    "Tente um período maior ou limpe um dos filtros ativos.",
  "Total · {count} entries": "Total · {count} registros",
  "{count} entries · page {page} of {pages}": "{count} registros · página {page} de {pages}",
  Previous: "Anterior",
  Next: "Próximo",
  "Report pages": "Páginas do relatório",
  "Group by": "Agrupar por",
  "Then by": "Depois por",
  "Weekly group": "Agrupamento semanal",
  Group: "Grupo",
  Period: "Período",
  Scope: "Escopo",
  Records: "Registros",
  Share: "Participação",
  "Average/day": "Média/dia",
  User: "Usuário",
  "Start date": "Data inicial",
  "End date": "Data final",
  report: "relatório",
  "Workspace report": "Relatório do workspace",
  "Your report": "Seu relatório",
  "{count} team members": "{count} membros da equipe",
  "{count} clients": "{count} clientes",
  "{count} projects": "{count} projetos",
  "The CSV export could not be prepared.":
    "Não conseguimos preparar a exportação CSV. Tente novamente.",
  "The Excel export could not be prepared.":
    "Não conseguimos preparar a exportação Excel. Tente novamente.",
  "Trackify · filtered report": "Trackify · relatório filtrado",
  Generated: "Gerado em",
  "Trackify · report export": "Trackify · exportação do relatório",
  "No records match the selected report.": "Nenhum registro corresponde ao relatório selecionado.",
  "The PDF print preview could not be prepared.":
    "Não conseguimos preparar a visualização de impressão do PDF. Tente novamente.",
  "The PDF print preview could not be opened.":
    "Não conseguimos abrir a visualização de impressão do PDF. Tente novamente.",
  "Export {scope}": "Exportar {scope}",
  "Project details — Trackify": "Detalhes do projeto — Trackify",
  "Could not create client": "Não conseguimos adicionar este cliente",
  "Choose valid personal preferences.": "Escolha preferências pessoais válidas.",
  "Trackify — Simple time tracking": "Trackify — Rastreador de tempo simples",
  "Trackify — Time tracking for small teams":
    "Trackify — Rastreador de tempo para pequenas equipes",
  "Trackify is a minimal time tracker for freelancers and small teams: live timer, time entries, reports and client billing.":
    "Trackify é um rastreador de tempo simples para freelancers e pequenas equipes: cronômetro, registros, relatórios e faturamento de clientes.",
  "Track hours, manage projects and bill clients with a calm, focused workspace.":
    "Acompanhe horas, gerencie projetos e fature clientes em um workspace calmo e focado.",
  "Start the live timer, log time and manage your entries in one focused workspace.":
    "Inicie o cronômetro, registre horas e gerencie seus registros em um workspace focado.",
  "Live timer and daily time entries in one focused view.":
    "Cronômetro e registros diários em uma única visão focada.",
  "Track hours per project, monitor status and open detailed project breakdowns.":
    "Acompanhe horas por projeto, monitore o status e abra detalhes completos.",
  "All client and internal projects with tracked time at a glance.":
    "Todos os projetos de clientes e internos com horas registradas em um só lugar.",
  "Manage clients, contacts and the projects connected to each client.":
    "Gerencie clientes, contatos e os projetos ligados a cada cliente.",
  "Client list with contacts and tracked time.":
    "Lista de clientes com contatos e horas registradas.",
  "Invite teammates, manage roles and track team hours.":
    "Convide colegas, gerencie funções e acompanhe as horas da equipe.",
  "Invite teammates and see tracked hours by member.":
    "Convide colegas e veja as horas registradas por membro.",
  "Detailed, summary, weekly and team time reports.":
    "Relatórios detalhados, resumidos, semanais e da equipe.",
  "Filter and understand tracked time.": "Filtre e entenda as horas registradas.",
  "Connect Trackify to Trello and sync cards into tracked tasks.":
    "Conecte o Trackify ao Trello e sincronize cartões como tarefas registradas.",
  "Trello sync for your time tracking.": "Sincronização do Trello para seu rastreador de tempo.",
  "Workspace settings and personal preferences.":
    "Configurações do workspace e preferências pessoais.",
  "Configure your Trackify workspace.": "Configure seu workspace do Trackify.",
  "Search projects, clients, teammates and time entries.":
    "Busque projetos, clientes, colegas e registros de horas.",
  "Find anything in your workspace.": "Encontre qualquer coisa no seu workspace.",
  Workspaces: "Workspaces",
  "Current workspace": "Workspace atual",
  "Switch workspace": "Alternar workspace",
  "Your workspaces": "Seus workspaces",
  "Shared with you": "Compartilhados com você",
  "Owned by you": "De sua propriedade",
  "Owned by {name}": "De {name}",
  Current: "Atual",
  Open: "Abrir",
  "New workspace": "Novo workspace",
  "New company workspace": "Novo workspace de empresa",
  "Edit workspace": "Editar workspace",
  Archive: "Arquivar",
  Restore: "Restaurar",
  Leave: "Sair",
  "Create workspace": "Criar workspace",
  "Create company workspace": "Criar workspace da empresa",
  "Create your company workspace": "Crie o workspace da sua empresa",
  "Company workspace name": "Nome do workspace da empresa",
  "Save changes": "Salvar alterações",
  Workspace: "Workspace",
  "Workspace logo": "Logo do workspace",
  "Upload logo": "Enviar logo",
  Remove: "Remover",
  "PNG, JPG or WebP up to 500 KB.": "PNG, JPG ou WebP de até 500 KB.",
  "Could not save workspace": "Não conseguimos salvar este workspace",
  "Workspace created": "Workspace criado",
  "Workspace updated": "Workspace atualizado",
  "Workspace archived": "Workspace arquivado",
  "Workspace restored": "Workspace restaurado",
  "Left workspace": "Você saiu do workspace",
  "Archive workspace?": "Arquivar workspace?",
  "Restore workspace?": "Restaurar workspace?",
  "Leave workspace?": "Sair do workspace?",
  "Archived workspaces become read-only until the Owner restores them.":
    "Workspaces arquivados ficam somente leitura até que o Owner os restaure.",
  "This workspace will become available for tracking again.":
    "Este workspace ficará disponível para registrar horas novamente.",
  "You will lose access to this workspace. Your tracked history stays intact.":
    "Você perderá acesso a este workspace. Seu histórico de horas permanecerá intacto.",
  "Workspace action unavailable": "Não conseguimos concluir essa ação no workspace",
  "Create a workspace to keep your projects, clients and time separate.":
    "Crie um workspace para manter seus projetos, clientes e horas separados.",
  "Create a company workspace to keep projects, clients and time together.":
    "Crie um workspace de empresa para reunir projetos, clientes e horas.",
  "Create company workspaces or open one shared with you.":
    "Crie workspaces de empresa ou abra um compartilhado com você.",
  "Archived workspaces are read-only. Restore it first.":
    "Workspaces arquivados são somente leitura. Restaure-o primeiro.",
  "This workspace is already archived.": "Este workspace já está arquivado.",
  "Archiving the current workspace will switch you to the first available active workspace.":
    "Ao arquivar o workspace atual, você será direcionado para o primeiro workspace ativo disponível.",
  "Keep at least one active workspace before archiving the current one.":
    "Mantenha pelo menos um workspace ativo antes de arquivar o workspace atual.",
  "Up to 5 workspaces created by you, including archived ones.":
    "Até 5 workspaces criados por você, incluindo os arquivados.",
  "Workspaces where you collaborate with another owner.":
    "Workspaces onde você colabora com outro proprietário.",
  "No workspaces yet": "Nenhum workspace ainda",
  "Create focused spaces for your work or open one shared with you.":
    "Crie espaços focados para seu trabalho ou abra um compartilhado com você.",
  "Pause timer before switching?": "Pausar cronômetro antes de alternar?",
  "Your active timer is running in {workspace}. Pause it before opening another workspace.":
    "Seu cronômetro ativo está rodando em {workspace}. Pause-o antes de abrir outro workspace.",
  "The timer will remain paused in its original workspace.":
    "O cronômetro permanecerá pausado no workspace original.",
  "Pause and switch": "Pausar e alternar",
  "Pause the active timer before opening another workspace. It will remain paused in its original workspace.":
    "Pause o cronômetro ativo antes de abrir outro workspace. Ele permanecerá pausado no workspace original.",
  "Only the workspace Owner can edit it.": "Somente o Owner do workspace pode editá-lo.",
  "The workspace owner must archive it instead of leaving it.":
    "O Owner deve arquivá-lo em vez de sair.",
  "Skip to content": "Pular para o conteúdo",
  "Main navigation": "Navegação principal",
  "Open navigation": "Abrir navegação",
  "Close navigation": "Fechar navegação",
  Trackify: "Trackify",
  "Actions for {name}": "Ações de {name}",
  "Unknown member": "Membro desconhecido",
  "Unknown project": "Projeto desconhecido",
  "Task is required.": "A tarefa é obrigatória.",
  Description: "Descrição",
  Entries: "Registros",
  Status: "Status",
  Billability: "Faturabilidade",
  Client: "Cliente",
  None: "Nenhum",
  "Cancel invitation?": "Cancelar convite?",
  "Remove member from team?": "Remover membro da equipe?",
  "Could not cancel invitation": "Não conseguimos cancelar este convite",
  "Could not remove member": "Não conseguimos remover este membro",
  "Client removed": "Cliente removido",
  "Entry updated": "Registro atualizado",
  "Restore access": "Restaurar acesso",
  "Sign in": "Entrar",
  "Create your account": "Crie sua conta",
  "Create account": "Criar conta",
  "Access your time tracking workspace.": "Acesse seu workspace do rastreador de tempo.",
  "Start a focused workspace for your team.": "Comece um workspace focado para sua equipe.",
  "Create an account to join your company or start a new workspace.":
    "Crie uma conta para entrar na sua empresa ou iniciar um novo workspace.",
  "Authentication failed": "Não conseguimos entrar na sua conta",
  "Forgot password?": "Esqueceu a senha?",
  "Remember me": "Lembrar-me",
  "Show password": "Mostrar senha",
  "Hide password": "Ocultar senha",
  "Signing in…": "Entrando…",
  "Continue with Google": "Continuar com Google",
  "Enter your password": "Digite sua senha",
  "Confirm your password": "Confirme sua senha",
  "Password is required": "A senha é obrigatória",
  "Password requirements": "Requisitos da senha",
  "We couldn't send the reset email": "Não foi possível enviar o e-mail de recuperação",
  "We couldn't send the reset email. Please try again.":
    "Não foi possível enviar o e-mail de recuperação. Tente novamente.",
  "If an account is associated with": "Se houver uma conta associada a",
  ", you will receive a link to reset your password.":
    ", você receberá um link para redefinir sua senha.",
  "Resend in {seconds}s": "Reenviar em {seconds}s",
  "Resend email": "Reenviar e-mail",
  "Correct email": "Corrigir e-mail",
  "At least 8 characters": "Pelo menos 8 caracteres",
  "At least one uppercase letter": "Pelo menos uma letra maiúscula",
  "At least one number": "Pelo menos um número",
  "Requirement met": "Requisito atendido",
  "Requirement not met": "Requisito não atendido",
  "Don't have an account?": "Ainda não tem uma conta?",
  "Password must be at least 8 characters.": "A senha deve ter pelo menos 8 caracteres.",
  "Password must contain at least one uppercase letter.":
    "A senha deve conter pelo menos uma letra maiúscula.",
  "Password must contain at least one number.": "A senha deve conter pelo menos um número.",
  "Use at least 8 characters, one uppercase letter and one number.":
    "Use pelo menos 8 caracteres, uma letra maiúscula e um número.",
  "Passwords do not match.": "As senhas não coincidem.",
  "Check your email to confirm your account before signing in.":
    "Confira seu e-mail para confirmar sua conta antes de entrar.",
  "Back to sign in": "Voltar para entrar",
  "Creating account…": "Criando conta…",
  "Already have an account?": "Já tem uma conta?",
  "Reset your password": "Redefina sua senha",
  "We will send a secure reset link to your email.":
    "Enviaremos um link seguro de redefinição para seu e-mail.",
  "If an account exists for this email, a reset link is on its way.":
    "Se houver uma conta para este e-mail, o link de redefinição foi enviado.",
  "Sending…": "Enviando…",
  or: "ou",
  "Send reset link": "Enviar link de redefinição",
  "Remember your password?": "Lembrou sua senha?",
  "Finishing sign in": "Finalizando entrada",
  "Preparing your workspace securely.": "Preparando seu workspace com segurança.",
  "Workspace invitation": "Convite para o workspace",
  "Accept your invitation to collaborate on tracked time.":
    "Aceite seu convite para colaborar no controle de horas.",
  "Your invitation is ready to be accepted.": "Seu convite está pronto para ser aceito.",
  "Sign in or create your account to accept this invitation.":
    "Entre ou crie sua conta para aceitar este convite.",
  "Open workspace": "Abrir workspace",
  "Accept invitation": "Aceitar convite",
  "Accepting invitation…": "Aceitando convite…",
  "Preparing your invitation…": "Preparando seu convite…",
  "Could not accept invitation": "Não conseguimos aceitar este convite",
  "Your invitation has been accepted.": "Seu convite foi aceito.",
  "This invitation link is missing or invalid.": "Este link de convite está ausente ou é inválido.",
  "If your company invited you, open the original invitation link. Otherwise, create a company workspace to get started.":
    "Se sua empresa convidou você, abra o link de convite original. Caso contrário, crie um workspace da empresa para começar.",
  "This invitation is no longer valid.": "Este convite não é mais válido.",
  "This workspace is archived.": "Este workspace está arquivado.",
  "This invitation belongs to a different email address.":
    "Este convite pertence a outro endereço de e-mail.",
  "You already have access to this workspace.": "Você já tem acesso a este workspace.",
  "Authentication is currently unavailable.": "A autenticação está indisponível no momento.",
  "Invalid invitation details.": "Os dados do convite são inválidos.",
  "Your session is not valid.": "Sua sessão não é válida.",
  "This section couldn't load": "Esta seção não pôde ser carregada.",
  "Try again, or check your connection if the problem continues.":
    "Tente novamente ou confira sua conexão se o problema continuar.",
  "We couldn't continue": "Não conseguimos continuar.",
  "We couldn't start the timer": "Não conseguimos iniciar o cronômetro.",
  "We couldn't save your preferences": "Não conseguimos salvar suas preferências.",
  "We couldn't sign you out: {error}": "Não conseguimos encerrar sua sessão: {error}",
  "Time entry moved to trash": "O registro de horas foi movido para a lixeira.",
  "We couldn't restore this time entry": "Não conseguimos restaurar este registro de horas.",
  "We couldn't save this time entry": "Não conseguimos salvar este registro de horas.",
  "Client added": "Cliente adicionado.",
  "We couldn't add this client": "Não conseguimos adicionar este cliente.",
  "We couldn't delete this client": "Não conseguimos excluir este cliente.",
  "Project is ready": "O projeto está pronto.",
  "Project is on hold": "O projeto está pausado.",
  "Project is active again": "O projeto está ativo novamente.",
  "Project is internal now": "O projeto agora é interno.",
  "Project is billable now": "O projeto agora é faturável.",
  "Project access updated": "O acesso ao projeto foi atualizado.",
  "We couldn't update this project": "Não conseguimos atualizar este projeto.",
  "We couldn't archive this project": "Não conseguimos arquivar este projeto.",
  "We couldn't delete this project": "Não conseguimos excluir este projeto.",
  "We couldn't create this project": "Não conseguimos criar este projeto.",
  "We couldn't update project access": "Não conseguimos atualizar o acesso ao projeto.",
  "Your export is ready": "Sua exportação está pronta.",
  "We couldn't prepare the export": "Não conseguimos preparar a exportação.",
  "Your preferences are up to date": "Suas preferências estão atualizadas.",
  "Your profile photo is updated": "Sua foto de perfil foi atualizada.",
  "Your profile photo was removed": "Sua foto de perfil foi removida.",
  "Your account is up to date": "Sua conta está atualizada.",
  "We couldn't load your account": "Não conseguimos carregar sua conta.",
  "Your account details are unavailable right now. Try again shortly.":
    "Os dados da sua conta estão indisponíveis no momento. Tente novamente em instantes.",
  "Your invitation is ready": "Seu convite está pronto para envio.",
  "We couldn't refresh this invitation": "Não conseguimos atualizar este convite.",
  "We couldn't restore access": "Não conseguimos restaurar o acesso.",
  "We couldn't change that role": "Não conseguimos alterar essa função.",
  "We couldn't prepare this invitation": "Não conseguimos preparar este convite.",
  "We couldn't cancel this invitation": "Não conseguimos cancelar este convite.",
  "We couldn't remove this member": "Não conseguimos remover este membro.",
  "We couldn't accept this invitation": "Não conseguimos aceitar este convite.",
  "We couldn't save this workspace": "Não conseguimos salvar este workspace.",
  "You can create up to 5 workspaces.": "Você pode criar até 5 workspaces.",
  "A workspace name is required.": "O nome do workspace é obrigatório.",
  "Choose a valid hourly rate.": "Escolha um valor por hora válido.",
  "Choose a valid currency.": "Escolha uma moeda válida.",
  "Choose a PNG, JPG or WebP logo smaller than 500 KB.":
    "Escolha um logo PNG, JPG ou WebP menor que 500 KB.",
  "Workspace logos must be smaller than 500 KB.": "O logo do workspace deve ter menos de 500 KB.",
  "The workspace was created, but your account could not be refreshed.":
    "O workspace foi criado, mas não foi possível atualizar sua conta.",
  "We couldn't sign you in": "Não conseguimos entrar na sua conta.",
  "We couldn't update the timer": "Não conseguimos atualizar o cronômetro.",
  "We couldn't add this manual entry": "Não conseguimos adicionar este registro manual.",
  "This client still has projects": "Este cliente ainda tem projetos vinculados.",
  "We couldn't complete that workspace action": "Não conseguimos concluir essa ação no workspace.",
  "We couldn't load this page": "Não conseguimos carregar esta página.",
  "We couldn't load this page. Try again or go back to the home page.":
    "Não conseguimos carregar esta página. Tente novamente ou volte para a página inicial.",
  "The profile photo couldn't be read. Try another image.":
    "Não conseguimos ler a foto de perfil. Tente outra imagem.",
  "The workspace logo couldn't be read. Try another image.":
    "Não conseguimos ler o logo do workspace. Tente outra imagem.",
  "This workspace could not be found.": "Não conseguimos encontrar esse workspace.",
  "You do not have access to this workspace.": "Você não tem acesso a esse workspace.",
  "No other workspace is available.": "Não há outro workspace ativo disponível.",
  "Stop the active timer before signing out.":
    "Pause ou pare o cronômetro ativo antes de sair da conta.",
  "The PDF export could not be prepared.":
    "Não conseguimos preparar a exportação PDF. Tente novamente.",
};

const enUS: Record<string, string> = {
  "This section couldn't load": "This section couldn't load",
  "Try again, or check your connection if the problem continues.":
    "Try again, or check your connection if the problem continues.",
  "We couldn't continue": "We couldn't continue",
  "We couldn't start the timer": "We couldn't start the timer",
  "We couldn't save your preferences": "We couldn't save your preferences",
  "We couldn't sign you out: {error}": "We couldn't sign you out: {error}",
  "Time entry moved to trash": "Time entry moved to trash",
  "We couldn't restore this time entry": "We couldn't restore this time entry",
  "We couldn't save this time entry": "We couldn't save this time entry",
  "Client added": "Client added",
  "We couldn't add this client": "We couldn't add this client",
  "We couldn't delete this client": "We couldn't delete this client",
  "Project is ready": "Project is ready",
  "Project is on hold": "Project is on hold",
  "Project is active again": "Project is active again",
  "Project is internal now": "Project is internal now",
  "Project is billable now": "Project is billable now",
  "Project access updated": "Project access updated",
  "We couldn't update this project": "We couldn't update this project",
  "We couldn't archive this project": "We couldn't archive this project",
  "We couldn't delete this project": "We couldn't delete this project",
  "We couldn't create this project": "We couldn't create this project",
  "We couldn't update project access": "We couldn't update project access",
  "Your export is ready": "Your export is ready",
  "We couldn't prepare the export": "We couldn't prepare the export",
  "Your preferences are up to date": "Your preferences are up to date",
  "Your profile photo is updated": "Your profile photo is updated",
  "Your profile photo was removed": "Your profile photo was removed",
  "Your account is up to date": "Your account is up to date",
  "We couldn't load your account": "We couldn't load your account",
  "Your account details are unavailable right now. Try again shortly.":
    "Your account details are unavailable right now. Try again shortly.",
  "Your invitation is ready": "Your invitation is ready",
  "We couldn't refresh this invitation": "We couldn't refresh this invitation",
  "We couldn't restore access": "We couldn't restore access",
  "We couldn't change that role": "We couldn't change that role",
  "We couldn't prepare this invitation": "We couldn't prepare this invitation",
  "We couldn't cancel this invitation": "We couldn't cancel this invitation",
  "We couldn't remove this member": "We couldn't remove this member",
  "We couldn't accept this invitation": "We couldn't accept this invitation",
  "We couldn't save this workspace": "We couldn't save this workspace",
  "We couldn't sign you in": "We couldn't sign you in",
  "We couldn't update the timer": "We couldn't update the timer",
  "We couldn't add this manual entry": "We couldn't add this manual entry",
  "This client still has projects": "This client still has projects",
  "We couldn't complete that workspace action": "We couldn't complete that workspace action",
  "We couldn't load this page": "We couldn't load this page",
  "We couldn't load this page. Try again or go back to the home page.":
    "We couldn't load this page. Try again or go back to the home page.",
  "This page didn't load": "We couldn't load this page",
  "Something went wrong on our end. You can try refreshing or head back home.":
    "We couldn't load this page. Try again or go back to the home page.",
  "Trackify could not load: {error}": "We couldn't load Trackify: {error}",
  "Your account cannot track time.": "This account can't track time yet.",
  "Your account cannot update the active timer.": "This account can't update the active timer.",
  "There is no active timer to update.": "There's no active timer to update yet.",
  "Stop the active timer before changing accounts.":
    "Pause or stop the current timer before changing accounts.",
  "Stop the active timer before adding time manually.":
    "Pause or stop the current timer before adding time manually.",
  "Stop the active timer before starting another one.":
    "Pause or stop the current timer before starting another one.",
  "Stop the active timer before deleting a project.":
    "Pause or stop the current timer before deleting a project.",
  "Stop the active timer before signing out.":
    "Pause or stop the current timer before signing out.",
  "This project is not assigned to your team member.":
    "This project isn't assigned to this team member yet.",
  "This project is archived and cannot be used to start a timer.":
    "This project is archived and cannot be used to start a timer.",
  "This project is inactive and cannot be used to start a timer.":
    "This project is inactive and cannot be used to start a timer.",
  "This time entry no longer exists.": "This time entry is no longer available.",
  "This project no longer exists.": "This project is no longer available.",
  "This client no longer exists.": "This client is no longer available.",
  "This team member no longer exists.": "This team member is no longer available.",
  "This workspace could not be found.": "We couldn't find that workspace.",
  "You do not have access to this workspace.": "You don't have access to that workspace.",
  "No other workspace is available.": "There isn't another active workspace to open.",
  "The profile photo could not be read.": "The profile photo couldn't be read. Try another image.",
  "The workspace logo could not be read.":
    "The workspace logo couldn't be read. Try another image.",
  "The CSV export could not be prepared.": "We couldn't prepare the CSV export. Try again.",
  "The Excel export could not be prepared.": "We couldn't prepare the Excel export. Try again.",
  "The PDF export could not be prepared.": "We couldn't prepare the PDF export. Try again.",
  "Workspace created": "Workspace created",
  "Workspace updated": "Workspace updated",
  "Workspace archived": "Workspace archived",
  "Workspace restored": "Workspace restored",
  "Left workspace": "You left the workspace",
};

type MessageValue = string | number;

function interpolate(template: string, values?: Record<string, MessageValue>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}

export function translate(
  key: string,
  locale: Locale = defaultLocale,
  values?: Record<string, MessageValue>,
): string {
  return interpolate(locale === "pt-BR" ? (ptBR[key] ?? key) : (enUS[key] ?? key), values);
}

interface I18nContextValue {
  locale: Locale;
  t: (key: string, values?: Record<string, MessageValue>) => string;
  error: (message: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function AppI18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      t: (key, values) => translate(key, locale, values),
      error: (message) => translate(message, locale),
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside AppI18nProvider");
  return context;
}

export function isLocale(value: unknown): value is Locale {
  return value === "en-US" || value === "pt-BR";
}
