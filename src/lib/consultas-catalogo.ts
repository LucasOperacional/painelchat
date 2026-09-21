// Catálogo de consultas do portal Recupera Big Tech.
// Gerado a partir da documentação pública em https://www.recuperabigtechmundial.com/docs

export type ConsultaProduto = {
  slug: string;
  nome: string;
  categoria: string;
  preco: number;
  entrada: string;
  pdf: boolean;
};

export const CONSULTAS_CATALOGO: ConsultaProduto[] = [
  {
    "slug": "ibama-debitos",
    "nome": "IBAMA - Certidão de Débitos Ambientais",
    "categoria": "ambiental",
    "preco": 0.82,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "ibama-embargo",
    "nome": "IBAMA - Certidão de Embargos",
    "categoria": "ambiental",
    "preco": 0.82,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "ibama-regularidade",
    "nome": "IBAMA - Certificado de Regularidade",
    "categoria": "ambiental",
    "preco": 0.82,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "ibama-autuacoes",
    "nome": "IBAMA — Autuações Ambientais",
    "categoria": "ambiental",
    "preco": 0.8,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "registration-brazil",
    "nome": "Validação Cadastral - Brasil",
    "categoria": "antifraude",
    "preco": 0.69,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "bc-inabilitados",
    "nome": "Banco Central - Inabilitados",
    "categoria": "bancario",
    "preco": 0.82,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "bc-proibidos",
    "nome": "Banco Central - Proibidos",
    "categoria": "bancario",
    "preco": 0.82,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "assistencia-social-pf",
    "nome": "Assistência Social - PF",
    "categoria": "beneficios",
    "preco": 1.71,
    "entrada": "CPF",
    "pdf": true
  },
  {
    "slug": "auxilio-emergencial",
    "nome": "Auxílio Emergencial",
    "categoria": "beneficios",
    "preco": 0.82,
    "entrada": "CPF",
    "pdf": true
  },
  {
    "slug": "auxilio-reconstrucao",
    "nome": "Auxílio Reconstrução",
    "categoria": "beneficios",
    "preco": 0.82,
    "entrada": "CPF",
    "pdf": true
  },
  {
    "slug": "bpc-beneficio",
    "nome": "Benefício de Prestação Continuada (BPC)",
    "categoria": "beneficios",
    "preco": 0.82,
    "entrada": "CPF",
    "pdf": true
  },
  {
    "slug": "bolsa-familia",
    "nome": "Bolsa Família",
    "categoria": "beneficios",
    "preco": 0.82,
    "entrada": "CPF",
    "pdf": true
  },
  {
    "slug": "garantia-safra",
    "nome": "Garantia Safra",
    "categoria": "beneficios",
    "preco": 0.82,
    "entrada": "CPF",
    "pdf": true
  },
  {
    "slug": "peti-trabalho-infantil",
    "nome": "PETI - Erradicação do Trabalho Infantil",
    "categoria": "beneficios",
    "preco": 0.82,
    "entrada": "CPF",
    "pdf": true
  },
  {
    "slug": "seguro-defeso",
    "nome": "Seguro Defeso - Pescador Artesanal",
    "categoria": "beneficios",
    "preco": 0.82,
    "entrada": "CPF",
    "pdf": true
  },
  {
    "slug": "busca-por-nome",
    "nome": "Busca por Nome",
    "categoria": "cadastral",
    "preco": 1.5,
    "entrada": "Nome completo",
    "pdf": false
  },
  {
    "slug": "cpf-pwn",
    "nome": "Cadastral Master Ultra",
    "categoria": "cadastral",
    "preco": 1.5,
    "entrada": "CPF ou CNPJ",
    "pdf": false
  },
  {
    "slug": "cadastro-pj-basica",
    "nome": "Cadastro Empresarial - Básico",
    "categoria": "cadastral",
    "preco": 0.51,
    "entrada": "CNPJ",
    "pdf": true
  },
  {
    "slug": "cadastro-pj-plus",
    "nome": "Cadastro Empresarial - Completo",
    "categoria": "cadastral",
    "preco": 1.04,
    "entrada": "CNPJ",
    "pdf": true
  },
  {
    "slug": "cadastro-pf-plus",
    "nome": "Cadastro Pessoal - Completo",
    "categoria": "cadastral",
    "preco": 1.15,
    "entrada": "CPF",
    "pdf": true
  },
  {
    "slug": "cadastro-pf-basica",
    "nome": "Cadastro Pessoal - Telefones e endereços",
    "categoria": "cadastral",
    "preco": 0.56,
    "entrada": "Telefone",
    "pdf": true
  },
  {
    "slug": "cadastro-rf-pf",
    "nome": "Cadastro Pessoal com Receita Federal",
    "categoria": "cadastral",
    "preco": 1.2,
    "entrada": "CPF",
    "pdf": true
  },
  {
    "slug": "cnh-pwn",
    "nome": "CNH PWN",
    "categoria": "cadastral",
    "preco": 0.12,
    "entrada": "CPF ou CNPJ",
    "pdf": false
  },
  {
    "slug": "dados-cadastrais-basicos",
    "nome": "Consulta básica CPF",
    "categoria": "cadastral",
    "preco": 0.38,
    "entrada": "CPF",
    "pdf": true
  },
  {
    "slug": "nome-basico",
    "nome": "Consulta Básica por Nome",
    "categoria": "cadastral",
    "preco": 0.06,
    "entrada": "Nome completo",
    "pdf": false
  },
  {
    "slug": "cpf-basica-fb",
    "nome": "Consulta Básica via CPF",
    "categoria": "cadastral",
    "preco": 0.09,
    "entrada": "CPF ou CNPJ",
    "pdf": false
  },
  {
    "slug": "sus",
    "nome": "Consulta Básica via DBSUS por CPF",
    "categoria": "cadastral",
    "preco": 0.03,
    "entrada": "CPF ou CNPJ",
    "pdf": false
  },
  {
    "slug": "cnpj-brazil-scraper",
    "nome": "Consulta CNPJ - Brazil Scraper",
    "categoria": "cadastral",
    "preco": 0.18,
    "entrada": "CPF ou CNPJ",
    "pdf": false
  },
  {
    "slug": "cnpj-empresas-brasil",
    "nome": "Consulta CNPJ - Empresas Brasil",
    "categoria": "cadastral",
    "preco": 0.07,
    "entrada": "CPF ou CNPJ",
    "pdf": false
  },
  {
    "slug": "empresas-cnpj-fb",
    "nome": "Consulta de Empresas por CNPJ",
    "categoria": "cadastral",
    "preco": 0.18,
    "entrada": "CPF ou CNPJ",
    "pdf": false
  },
  {
    "slug": "consulta-obito",
    "nome": "Consulta de Óbito",
    "categoria": "cadastral",
    "preco": 0.69,
    "entrada": "CPF",
    "pdf": true
  },
  {
    "slug": "reg-rg",
    "nome": "Consulta de Registros por RG",
    "categoria": "cadastral",
    "preco": 0.09,
    "entrada": "Número do RG",
    "pdf": false
  },
  {
    "slug": "credlink-cep",
    "nome": "Consulta por CEP via CredLink",
    "categoria": "cadastral",
    "preco": 0.3,
    "entrada": "CEP",
    "pdf": false
  },
  {
    "slug": "credlink-cnpj",
    "nome": "Consulta por CNPJ via CredLink",
    "categoria": "cadastral",
    "preco": 0.3,
    "entrada": "CPF ou CNPJ",
    "pdf": false
  },
  {
    "slug": "credlink-cpf",
    "nome": "Consulta por CPF via CredLink",
    "categoria": "cadastral",
    "preco": 0.9,
    "entrada": "CPF ou CNPJ",
    "pdf": false
  },
  {
    "slug": "nascimento",
    "nome": "Consulta por Data de Nascimento",
    "categoria": "cadastral",
    "preco": 0.09,
    "entrada": "Data de nascimento",
    "pdf": false
  },
  {
    "slug": "credlink-nome",
    "nome": "Consulta por Nome via CredLink",
    "categoria": "cadastral",
    "preco": 0.3,
    "entrada": "Nome completo",
    "pdf": false
  },
  {
    "slug": "credlink-telefone",
    "nome": "Consulta por Telefone via CredLink",
    "categoria": "cadastral",
    "preco": 0.3,
    "entrada": "Telefone",
    "pdf": false
  },
  {
    "slug": "cpf-completo",
    "nome": "CPF Completo",
    "categoria": "cadastral",
    "preco": 1.5,
    "entrada": "CPF ou CNPJ",
    "pdf": false
  },
  {
    "slug": "reg-cep",
    "nome": "Dados Registrais: Busca por CEP",
    "categoria": "cadastral",
    "preco": 0.09,
    "entrada": "CEP",
    "pdf": false
  },
  {
    "slug": "reg-cpf",
    "nome": "Dados Registrais: Busca por CPF",
    "categoria": "cadastral",
    "preco": 0.12,
    "entrada": "CPF ou CNPJ",
    "pdf": false
  },
  {
    "slug": "reg-email",
    "nome": "Dados Registrais: Busca por Email",
    "categoria": "cadastral",
    "preco": 0.09,
    "entrada": "E-mail",
    "pdf": false
  },
  {
    "slug": "reg-nome",
    "nome": "Dados Registrais: Busca por Nome",
    "categoria": "cadastral",
    "preco": 0.06,
    "entrada": "Nome completo",
    "pdf": false
  },
  {
    "slug": "historico-imobiliario",
    "nome": "Histórico Imobiliário (DOI)",
    "categoria": "cadastral",
    "preco": 0.32,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "nivel-socioeconomico",
    "nome": "Nível Socioeconômico e Renda",
    "categoria": "cadastral",
    "preco": 0.69,
    "entrada": "CPF",
    "pdf": true
  },
  {
    "slug": "participacao-societaria",
    "nome": "Participação Societária — percentual por sócio",
    "categoria": "cadastral",
    "preco": 3.46,
    "entrada": "CNPJ",
    "pdf": true
  },
  {
    "slug": "vinculos-societarios-bases",
    "nome": "Participações Societárias do CPF (base Receita Federal)",
    "categoria": "cadastral",
    "preco": 0.86,
    "entrada": "CNPJ",
    "pdf": true
  },
  {
    "slug": "cadin-prefeitura-SP",
    "nome": "Prefeitura SP - CADIN",
    "categoria": "cadastral",
    "preco": 0.45,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "receita-federal-pf",
    "nome": "Receita Federal - Pessoa Física",
    "categoria": "cadastral",
    "preco": 0.86,
    "entrada": "CPF",
    "pdf": true
  },
  {
    "slug": "receita-federal-pj",
    "nome": "Receita Federal — Pessoa Jurídica",
    "categoria": "cadastral",
    "preco": 0.69,
    "entrada": "CNPJ",
    "pdf": true
  },
  {
    "slug": "receita-federal-pj-live",
    "nome": "Receita Federal — Pessoa Jurídica (Tempo Real)",
    "categoria": "cadastral",
    "preco": 0.86,
    "entrada": "CNPJ",
    "pdf": true
  },
  {
    "slug": "relacao-filiais",
    "nome": "Relação de Filiais",
    "categoria": "cadastral",
    "preco": 0.51,
    "entrada": "CNPJ",
    "pdf": true
  },
  {
    "slug": "restituicao-irpf",
    "nome": "Restituição do IRPF (Receita Federal)",
    "categoria": "cadastral",
    "preco": 0.58,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "telefone-pwn",
    "nome": "Telefone PWN",
    "categoria": "cadastral",
    "preco": 0.15,
    "entrada": "Telefone",
    "pdf": false
  },
  {
    "slug": "vinculos-societarios",
    "nome": "Vínculos Societários",
    "categoria": "cadastral",
    "preco": 4.42,
    "entrada": "CNPJ",
    "pdf": true
  },
  {
    "slug": "vinculos-ubo",
    "nome": "Vínculos Societários (UBO) — PJ",
    "categoria": "cadastral",
    "preco": 2.38,
    "entrada": "CNPJ",
    "pdf": true
  },
  {
    "slug": "ccd-pf",
    "nome": "Certidão Conjunta de Débitos - PF",
    "categoria": "certidoes",
    "preco": 0.69,
    "entrada": "CPF",
    "pdf": true
  },
  {
    "slug": "ccd-pj",
    "nome": "Certidão Conjunta de Débitos - PJ",
    "categoria": "certidoes",
    "preco": 1.39,
    "entrada": "CNPJ",
    "pdf": true
  },
  {
    "slug": "tst-cndt",
    "nome": "Certidão Negativa de Débitos Trabalhistas (CNDT)",
    "categoria": "certidoes",
    "preco": 0.86,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "leads-contato",
    "nome": "Contato do Lead",
    "categoria": "comercial",
    "preco": 0.82,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "enriquecimento-lead",
    "nome": "Enriquecimento de Lead",
    "categoria": "comercial",
    "preco": 0.46,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "leads-endereco",
    "nome": "Leads por Endereço",
    "categoria": "comercial",
    "preco": 2.13,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "acordos-leniencia",
    "nome": "Acordos de Leniência",
    "categoria": "compliance",
    "preco": 0.82,
    "entrada": "CNPJ",
    "pdf": true
  },
  {
    "slug": "oab-advogados",
    "nome": "Advogados — Cadastro Nacional (OAB)",
    "categoria": "compliance",
    "preco": 0.96,
    "entrada": "Número da OAB",
    "pdf": true
  },
  {
    "slug": "anbima-certificado-edu",
    "nome": "Certificações Anbima",
    "categoria": "compliance",
    "preco": 0.8,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "bet-safe-compliance",
    "nome": "Compliance para Apostas (Bet Safe)",
    "categoria": "compliance",
    "preco": 1.38,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "cnia-improbidade",
    "nome": "Condenações por Improbidade (CNIA)",
    "categoria": "compliance",
    "preco": 0.82,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "cvm-processos-sancionadores",
    "nome": "CVM — Processos Sancionadores",
    "categoria": "compliance",
    "preco": 0.8,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "cvm-valores-mobiliarios",
    "nome": "CVM — Valores Mobiliários",
    "categoria": "compliance",
    "preco": 0.8,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "ceis-sancoes",
    "nome": "Empresas Inidôneas e Suspensas (CEIS)",
    "categoria": "compliance",
    "preco": 0.69,
    "entrada": "CNPJ",
    "pdf": true
  },
  {
    "slug": "cnep-sancoes",
    "nome": "Empresas Punidas (CNEP)",
    "categoria": "compliance",
    "preco": 0.69,
    "entrada": "CNPJ",
    "pdf": true
  },
  {
    "slug": "cepim",
    "nome": "Entidades Impedidas (CEPIM)",
    "categoria": "compliance",
    "preco": 0.82,
    "entrada": "CEP",
    "pdf": true
  },
  {
    "slug": "ceaf-expulsoes",
    "nome": "Expulsões da Administração Federal (CEAF)",
    "categoria": "compliance",
    "preco": 0.82,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "sicaf-fornecedor",
    "nome": "Fornecedor do Governo Federal (SICAF)",
    "categoria": "compliance",
    "preco": 0.46,
    "entrada": "CNPJ",
    "pdf": true
  },
  {
    "slug": "listas-restritivas",
    "nome": "Listas Restritivas e Sanções — PF",
    "categoria": "compliance",
    "preco": 2.38,
    "entrada": "CPF",
    "pdf": true
  },
  {
    "slug": "midia-adversa",
    "nome": "Mídia Adversa — PF",
    "categoria": "compliance",
    "preco": 2.38,
    "entrada": "CPF",
    "pdf": true
  },
  {
    "slug": "offshore-leaks",
    "nome": "Offshore Leaks (ICIJ)",
    "categoria": "compliance",
    "preco": 0.96,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "pep-exposicao",
    "nome": "Pessoa Exposta Politicamente (PEP)",
    "categoria": "compliance",
    "preco": 0.69,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "aml-vinculos",
    "nome": "Prevenção à Lavagem de Dinheiro (AML)",
    "categoria": "compliance",
    "preco": 1.57,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "confea-crea",
    "nome": "Registro Profissional - CONFEA/CREA",
    "categoria": "compliance",
    "preco": 0.82,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "crbm",
    "nome": "CRBM — Conselho Regional de Biomedicina",
    "categoria": "conselhos",
    "preco": 0.48,
    "entrada": "CPF",
    "pdf": true
  },
  {
    "slug": "crf",
    "nome": "CRF — Conselho Regional de Farmácia",
    "categoria": "conselhos",
    "preco": 0.48,
    "entrada": "CPF",
    "pdf": true
  },
  {
    "slug": "boa-vista-acerta-pf",
    "nome": "Análise de Risco Positivo - PF (Boa Vista)",
    "categoria": "credito",
    "preco": 19.65,
    "entrada": "CPF",
    "pdf": true
  },
  {
    "slug": "boa-vista-risco-pj",
    "nome": "Análise de Risco Positivo - PJ (Boa Vista)",
    "categoria": "credito",
    "preco": 23.42,
    "entrada": "CNPJ",
    "pdf": true
  },
  {
    "slug": "sisbajud-chave",
    "nome": "Consulta PIX por Chave/CPF/CNPJ/Telefone/Email",
    "categoria": "credito",
    "preco": 0.81,
    "entrada": "Termo / Tribunal",
    "pdf": false
  },
  {
    "slug": "credito-positivo-pf",
    "nome": "Crédito Positivo PF",
    "categoria": "credito",
    "preco": 12.8,
    "entrada": "CPF ou CNPJ",
    "pdf": false
  },
  {
    "slug": "credito-positivo-pj",
    "nome": "Crédito Positivo PJ",
    "categoria": "credito",
    "preco": 12.8,
    "entrada": "CPF ou CNPJ",
    "pdf": false
  },
  {
    "slug": "credito-scr-resumo",
    "nome": "Histórico de Crédito - SCR",
    "categoria": "credito",
    "preco": 11.31,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "credito-scr-analitico",
    "nome": "Histórico de Crédito - SCR Analítico",
    "categoria": "credito",
    "preco": 9.36,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "boa-vista-limite-pj",
    "nome": "Limite de Crédito — PJ (Boa Vista)",
    "categoria": "credito",
    "preco": 46.48,
    "entrada": "CNPJ",
    "pdf": true
  },
  {
    "slug": "sisbajud-chaves",
    "nome": "Lista de Chaves PIX via Sisbajud por CPF/CNPJ",
    "categoria": "credito",
    "preco": 1.5,
    "entrada": "CPF ou CNPJ",
    "pdf": false
  },
  {
    "slug": "max-brasil-avancado-cnpj",
    "nome": "MAX Brasil Avançado CNPJ",
    "categoria": "credito",
    "preco": 7.84,
    "entrada": "CPF ou CNPJ",
    "pdf": false
  },
  {
    "slug": "nuclea-concentracao-transacionado",
    "nome": "Núclea — Concentração de Contrapartes",
    "categoria": "credito",
    "preco": 10.3,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "nuclea-predicao-transacionado",
    "nome": "Núclea — Predição de Valor Transacionado",
    "categoria": "credito",
    "preco": 10.3,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "nuclea-historico-transacionado",
    "nome": "Núclea — Valor Histórico Transacionado",
    "categoria": "credito",
    "preco": 10.3,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "protestos-brasil",
    "nome": "Protestos - Brasil",
    "categoria": "credito",
    "preco": 10.4,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "quod-consulta",
    "nome": "QUOD",
    "categoria": "credito",
    "preco": 3.02,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "rating-diagnostico-360",
    "nome": "Rating de Crédito + Diagnóstico Finan. 360",
    "categoria": "credito",
    "preco": 18.02,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "rating-score",
    "nome": "Rating Score",
    "categoria": "credito",
    "preco": 9.6,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "detalhamento-negativo",
    "nome": "Restrições e Negativações (Quod)",
    "categoria": "credito",
    "preco": 4.53,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "boa-vista-completo-pf",
    "nome": "Risco de Crédito Completo — PF (Boa Vista)",
    "categoria": "credito",
    "preco": 31.04,
    "entrada": "CPF",
    "pdf": true
  },
  {
    "slug": "score-credito-quod",
    "nome": "Score de Crédito (Quod)",
    "categoria": "credito",
    "preco": 3.74,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "score-restricoes",
    "nome": "Score e Restrições",
    "categoria": "credito",
    "preco": 3.02,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "scpc-basica-pf",
    "nome": "SCPC Básica PF",
    "categoria": "credito",
    "preco": 0.48,
    "entrada": "CPF ou CNPJ",
    "pdf": false
  },
  {
    "slug": "scpc-net-protestos-cadastral-pj",
    "nome": "SCPC Net + Protestos + Cadastral PJ",
    "categoria": "credito",
    "preco": 1.42,
    "entrada": "CPF ou CNPJ",
    "pdf": false
  },
  {
    "slug": "scpc-net-pj",
    "nome": "SCPC Net PJ",
    "categoria": "credito",
    "preco": 1.58,
    "entrada": "CPF ou CNPJ",
    "pdf": false
  },
  {
    "slug": "scr-premium-integracoes",
    "nome": "SCR Premium + Integrações",
    "categoria": "credito",
    "preco": 2.8,
    "entrada": "CPF ou CNPJ",
    "pdf": false
  },
  {
    "slug": "serasa-crednet",
    "nome": "Serasa Crednet",
    "categoria": "credito",
    "preco": 7.78,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "serasa-experian",
    "nome": "Serasa Experian PF",
    "categoria": "credito",
    "preco": 6.09,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "serasa-experian-pj",
    "nome": "Serasa Experian PJ",
    "categoria": "credito",
    "preco": 6.09,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "serasa-premium-cnpj",
    "nome": "Serasa Premium CNPJ",
    "categoria": "credito",
    "preco": 7.34,
    "entrada": "CPF ou CNPJ",
    "pdf": false
  },
  {
    "slug": "serasa-premium-cpf",
    "nome": "Serasa Premium CPF",
    "categoria": "credito",
    "preco": 7.34,
    "entrada": "CPF ou CNPJ",
    "pdf": false
  },
  {
    "slug": "tse-situacao",
    "nome": "Situação Eleitoral (TSE)",
    "categoria": "eleitoral",
    "preco": 0.69,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "tse-titulo",
    "nome": "Título de Eleitor e Local de Votação",
    "categoria": "eleitoral",
    "preco": 2.4,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "tse-titulo-info",
    "nome": "Título Eleitoral e Local de Votação por CPF",
    "categoria": "eleitoral",
    "preco": 2.64,
    "entrada": "CPF",
    "pdf": true
  },
  {
    "slug": "antt-regularidade",
    "nome": "ANTT - Regularidade de Transportadora",
    "categoria": "fiscal",
    "preco": 0.82,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "cadin-federal",
    "nome": "CADIN - Cadastro Informativo de Créditos (LEGADO)",
    "categoria": "fiscal",
    "preco": 0.82,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "cadin-sp",
    "nome": "CADIN - São Paulo (LEGADO)",
    "categoria": "fiscal",
    "preco": 0.82,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "cadin-estadual",
    "nome": "CADIN Estadual",
    "categoria": "fiscal",
    "preco": 0.82,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "carf-recursos-fiscais",
    "nome": "CARF — Recursos Fiscais",
    "categoria": "fiscal",
    "preco": 0.8,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "pgfn-devedores",
    "nome": "Devedores da União (PGFN)",
    "categoria": "fiscal",
    "preco": 0.69,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "nfe-completa",
    "nome": "Nota Fiscal Eletrônica - Completa",
    "categoria": "fiscal",
    "preco": 2.98,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "nfe-inutilizacoes",
    "nome": "Nota Fiscal Eletrônica - Inutilizações",
    "categoria": "fiscal",
    "preco": 2.98,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "sintegra-estadual",
    "nome": "Sintegra - Cadastro Estadual",
    "categoria": "fiscal",
    "preco": 0.46,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "suframa-consulta",
    "nome": "Suframa - Zona Franca de Manaus",
    "categoria": "fiscal",
    "preco": 0.82,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "fincen-crimes",
    "nome": "Crimes Financeiros - FinCEN",
    "categoria": "internacional",
    "preco": 0.69,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "feriados",
    "nome": "Feriados Nacionais",
    "categoria": "internacional",
    "preco": 0.02,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "onu-sancoes",
    "nome": "Lista Consolidada da ONU",
    "categoria": "internacional",
    "preco": 0.82,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "fbi-wanted",
    "nome": "Lista de Procurados do FBI",
    "categoria": "internacional",
    "preco": 0.82,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "interpol-consulta",
    "nome": "Mandados Internacionais - INTERPOL",
    "categoria": "internacional",
    "preco": 2.98,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "curp-mexico",
    "nome": "Registro Nacional de Población - CURP",
    "categoria": "internacional",
    "preco": 0.82,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "dfat-sancoes-australia",
    "nome": "Sanções — Austrália (DFAT)",
    "categoria": "internacional",
    "preco": 0.96,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "sema-sancoes-canada",
    "nome": "Sanções — Canadá (SEMA)",
    "categoria": "internacional",
    "preco": 0.96,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "seco-sancoes-suica",
    "nome": "Sanções — Suíça (SECO)",
    "categoria": "internacional",
    "preco": 0.96,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "eu-sancoes",
    "nome": "Sanções Financeiras da União Europeia",
    "categoria": "internacional",
    "preco": 2.98,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "uk-sancoes",
    "nome": "Sanções Financeiras do Reino Unido",
    "categoria": "internacional",
    "preco": 0.69,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "ofac-sancoes",
    "nome": "Sanções OFAC (EUA)",
    "categoria": "internacional",
    "preco": 0.82,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "registration-mexico",
    "nome": "Validação Cadastral - México",
    "categoria": "internacional",
    "preco": 0.82,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "similarity-mexico",
    "nome": "Validação de Similaridade - México",
    "categoria": "internacional",
    "preco": 1.65,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "antecedentes-federais",
    "nome": "Antecedentes Criminais — Polícia Federal",
    "categoria": "juridico",
    "preco": 0.96,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "jurisprudencia",
    "nome": "Jurisprudência",
    "categoria": "juridico",
    "preco": 2.0,
    "entrada": "Termo / Tribunal",
    "pdf": true
  },
  {
    "slug": "cnj-mandados-prisao",
    "nome": "Mandados de Prisão (CNJ)",
    "categoria": "juridico",
    "preco": 1.38,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "mpt-consulta",
    "nome": "Ministério Público do Trabalho (MPT)",
    "categoria": "juridico",
    "preco": 2.98,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "mpmt-investigacao",
    "nome": "MP Mato Grosso - Procedimentos Investigatórios",
    "categoria": "juridico",
    "preco": 0.82,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "peticoes-juridicas",
    "nome": "Petições Jurídicas",
    "categoria": "juridico",
    "preco": 2.5,
    "entrada": "Termo / Tribunal",
    "pdf": false
  },
  {
    "slug": "prf-infracoes",
    "nome": "Polícia Rodoviária Federal - Infrações",
    "categoria": "juridico",
    "preco": 0.82,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "processo-numero",
    "nome": "Processo Judicial por Número",
    "categoria": "juridico",
    "preco": 0.75,
    "entrada": "Número do processo",
    "pdf": false
  },
  {
    "slug": "tj-processos",
    "nome": "Processos - Tribunal de Justiça",
    "categoria": "juridico",
    "preco": 0.69,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "processos-completa",
    "nome": "Processos Judiciais - Completo",
    "categoria": "juridico",
    "preco": 7.5,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "processos-agrupada",
    "nome": "Processos Judiciais - Resumo Agrupado",
    "categoria": "juridico",
    "preco": 2.64,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "processos-simplificada",
    "nome": "Processos Judiciais — Simplificado",
    "categoria": "juridico",
    "preco": 4.0,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "processos-cnpj",
    "nome": "Processos Judiciais por CNPJ",
    "categoria": "juridico",
    "preco": 0.75,
    "entrada": "CPF ou CNPJ",
    "pdf": false
  },
  {
    "slug": "processos-cpf",
    "nome": "Processos Judiciais por CPF",
    "categoria": "juridico",
    "preco": 0.75,
    "entrada": "CPF ou CNPJ",
    "pdf": false
  },
  {
    "slug": "processos-oab",
    "nome": "Processos Judiciais por OAB",
    "categoria": "juridico",
    "preco": 0.75,
    "entrada": "Número da OAB",
    "pdf": false
  },
  {
    "slug": "protesto-nacional-provedor3",
    "nome": "Protesto Nacional (Provedor 3)",
    "categoria": "juridico",
    "preco": 1.26,
    "entrada": "CPF ou CNPJ",
    "pdf": false
  },
  {
    "slug": "tcu-processo",
    "nome": "TCU - Certidão de Processos",
    "categoria": "juridico",
    "preco": 0.82,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "tcu-consolidada",
    "nome": "TCU - Consulta Consolidada PJ",
    "categoria": "juridico",
    "preco": 1.38,
    "entrada": "CNPJ",
    "pdf": true
  },
  {
    "slug": "tcu-licitante",
    "nome": "TCU - Licitante Inidôneo",
    "categoria": "juridico",
    "preco": 0.82,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "trt-consulta",
    "nome": "Tribunal Regional do Trabalho (TRT)",
    "categoria": "juridico",
    "preco": 1.01,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "otp-send",
    "nome": "Enviar código OTP",
    "categoria": "mensageria",
    "preco": 0.46,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "sms-enviar",
    "nome": "Enviar SMS",
    "categoria": "mensageria",
    "preco": 0.46,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "otp-resend",
    "nome": "Reenviar código OTP",
    "categoria": "mensageria",
    "preco": 0.46,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "sms-status",
    "nome": "Status de SMS",
    "categoria": "mensageria",
    "preco": 0.0,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "otp-verify",
    "nome": "Verificar código OTP",
    "categoria": "mensageria",
    "preco": 0.0,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "anac-aeronaves",
    "nome": "Aeronaves por CPF/CNPJ (RAB/ANAC)",
    "categoria": "patrimonio",
    "preco": 1.07,
    "entrada": "CNPJ",
    "pdf": true
  },
  {
    "slug": "reputacao-empresarial-brasil",
    "nome": "Consulta Reputação Empresarial Brasil",
    "categoria": "reputacao",
    "preco": 0.25,
    "entrada": "Nome da empresa",
    "pdf": true
  },
  {
    "slug": "agricultura-familiar-pf",
    "nome": "Agricultura Familiar — PF (CAF)",
    "categoria": "rural",
    "preco": 0.8,
    "entrada": "CPF",
    "pdf": true
  },
  {
    "slug": "agricultura-familiar-pj",
    "nome": "Agricultura Familiar — PJ (CAF)",
    "categoria": "rural",
    "preco": 0.8,
    "entrada": "CNPJ",
    "pdf": true
  },
  {
    "slug": "apf-rural",
    "nome": "Autorização Provisória de Funcionamento Rural",
    "categoria": "rural",
    "preco": 0.82,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "car-ambiental",
    "nome": "Cadastro Ambiental Rural (CAR)",
    "categoria": "rural",
    "preco": 0.82,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "cafir-imoveis",
    "nome": "Cadastro de Imóveis Rurais (CAFIR)",
    "categoria": "rural",
    "preco": 0.82,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "dap-pf",
    "nome": "Declaração PRONAF - PF",
    "categoria": "rural",
    "preco": 1.38,
    "entrada": "CPF",
    "pdf": true
  },
  {
    "slug": "dap-pj",
    "nome": "Declaração PRONAF - PJ",
    "categoria": "rural",
    "preco": 1.65,
    "entrada": "CNPJ",
    "pdf": true
  },
  {
    "slug": "pis-trabalho",
    "nome": "Consulta PIS - Ministério do Trabalho",
    "categoria": "trabalhista",
    "preco": 0.69,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "fgts-regularidade",
    "nome": "FGTS - Regularidade do Empregador",
    "categoria": "trabalhista",
    "preco": 0.69,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "historico-profissional",
    "nome": "Histórico Profissional e Renda",
    "categoria": "trabalhista",
    "preco": 1.07,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "vinculo-empregaticio",
    "nome": "Vínculo Empregatício",
    "categoria": "trabalhista",
    "preco": 1.38,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "cep",
    "nome": "Pesquisa de CEP",
    "categoria": "utilidades",
    "preco": 0.05,
    "entrada": "CEP",
    "pdf": true
  },
  {
    "slug": "agregados-basica",
    "nome": "Agregados Básica (Veicular)",
    "categoria": "veicular",
    "preco": 0.22,
    "entrada": "Placa do veículo",
    "pdf": false
  },
  {
    "slug": "auto-vistoria",
    "nome": "Auto Vistoria",
    "categoria": "veicular",
    "preco": 31.84,
    "entrada": "Placa do veículo",
    "pdf": false
  },
  {
    "slug": "renavam-comunicacao-venda",
    "nome": "Comunicação de Venda por Placa (RENAVAM)",
    "categoria": "veicular",
    "preco": 0.72,
    "entrada": "Placa do veículo",
    "pdf": true
  },
  {
    "slug": "cnh-senatran",
    "nome": "Condutor/CNH por CPF via Senatran",
    "categoria": "veicular",
    "preco": 0.9,
    "entrada": "CPF ou CNPJ",
    "pdf": false
  },
  {
    "slug": "cnh-serpro",
    "nome": "Consulta de CNH via Serpro",
    "categoria": "veicular",
    "preco": 0.21,
    "entrada": "CPF ou CNPJ",
    "pdf": false
  },
  {
    "slug": "placa-serpro",
    "nome": "Consulta de Placa via Serpro",
    "categoria": "veicular",
    "preco": 0.21,
    "entrada": "Placa do veículo",
    "pdf": false
  },
  {
    "slug": "frota",
    "nome": "Consulta Frota de Veículos por CPF",
    "categoria": "veicular",
    "preco": 0.15,
    "entrada": "CPF ou CNPJ",
    "pdf": false
  },
  {
    "slug": "leilao-vip-gold",
    "nome": "Consulta Leilão VIP Gold",
    "categoria": "veicular",
    "preco": 28.64,
    "entrada": "Placa do veículo",
    "pdf": false
  },
  {
    "slug": "chassi-serpro",
    "nome": "Consulta por Chassi via Serpro",
    "categoria": "veicular",
    "preco": 0.21,
    "entrada": "Chassi",
    "pdf": false
  },
  {
    "slug": "renavam-serpro",
    "nome": "Consulta por Renavam via Serpro",
    "categoria": "veicular",
    "preco": 0.21,
    "entrada": "Renavam",
    "pdf": false
  },
  {
    "slug": "consulta-veicular",
    "nome": "Consulta Veicular",
    "categoria": "veicular",
    "preco": 3.18,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "crlv-al",
    "nome": "CRLV Digital por Placa (AL)",
    "categoria": "veicular",
    "preco": 7.5,
    "entrada": "Placa do veículo",
    "pdf": false
  },
  {
    "slug": "crlv-ma",
    "nome": "CRLV Digital por Placa (MA)",
    "categoria": "veicular",
    "preco": 7.5,
    "entrada": "Placa do veículo",
    "pdf": false
  },
  {
    "slug": "crlv-mg",
    "nome": "CRLV Digital por Placa (MG)",
    "categoria": "veicular",
    "preco": 6.0,
    "entrada": "Placa do veículo",
    "pdf": false
  },
  {
    "slug": "crlv-pa",
    "nome": "CRLV Digital por Placa (PA)",
    "categoria": "veicular",
    "preco": 7.5,
    "entrada": "Placa do veículo",
    "pdf": false
  },
  {
    "slug": "crlv-pi",
    "nome": "CRLV Digital por Placa (PI)",
    "categoria": "veicular",
    "preco": 7.5,
    "entrada": "Placa do veículo",
    "pdf": false
  },
  {
    "slug": "crlv-to",
    "nome": "CRLV Digital por Placa (TO)",
    "categoria": "veicular",
    "preco": 7.5,
    "entrada": "Placa do veículo",
    "pdf": false
  },
  {
    "slug": "placa-debitos-webhook",
    "nome": "Débitos de Veículo (assíncrono)",
    "categoria": "veicular",
    "preco": 0.3,
    "entrada": "Placa do veículo",
    "pdf": false
  },
  {
    "slug": "laudo-veicular-id",
    "nome": "Detalhes e Fotos de Laudo pelo ID",
    "categoria": "veicular",
    "preco": 0.9,
    "entrada": "ID do laudo",
    "pdf": false
  },
  {
    "slug": "gravame-veicular",
    "nome": "Gravame Veicular",
    "categoria": "veicular",
    "preco": 7.66,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "habilitacao-cnh",
    "nome": "Habilitação (CNH)",
    "categoria": "veicular",
    "preco": 2.4,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "laudo-veicular",
    "nome": "Laudo Veicular SISCSV + ECV",
    "categoria": "veicular",
    "preco": 0.9,
    "entrada": "Placa do veículo",
    "pdf": false
  },
  {
    "slug": "leilao-base01-score",
    "nome": "Leilão Base 01 Score Veicular",
    "categoria": "veicular",
    "preco": 4.96,
    "entrada": "Placa do veículo",
    "pdf": false
  },
  {
    "slug": "leilao-score-indicio",
    "nome": "Leilão Score + Indício",
    "categoria": "veicular",
    "preco": 9.36,
    "entrada": "Placa do veículo",
    "pdf": false
  },
  {
    "slug": "multas-senatran",
    "nome": "Multas por Placa via Senatran",
    "categoria": "veicular",
    "preco": 0.45,
    "entrada": "Placa do veículo",
    "pdf": false
  },
  {
    "slug": "multas-senatran-ctb",
    "nome": "Multas por Placa via Senatran (CTB)",
    "categoria": "veicular",
    "preco": 0.45,
    "entrada": "Placa do veículo",
    "pdf": false
  },
  {
    "slug": "ocorrencias-senatran",
    "nome": "Ocorrências Roubo/Furto por Placa via Senatran",
    "categoria": "veicular",
    "preco": 0.45,
    "entrada": "Placa do veículo",
    "pdf": false
  },
  {
    "slug": "placa-cortex",
    "nome": "Passagens/Radar por Placa",
    "categoria": "veicular",
    "preco": 0.9,
    "entrada": "Placa do veículo",
    "pdf": false
  },
  {
    "slug": "placa-pwn",
    "nome": "Placa PWN",
    "categoria": "veicular",
    "preco": 0.12,
    "entrada": "Placa do veículo",
    "pdf": false
  },
  {
    "slug": "placa-pwndb",
    "nome": "Placa PWN + Fallback DB",
    "categoria": "veicular",
    "preco": 0.18,
    "entrada": "Placa do veículo",
    "pdf": false
  },
  {
    "slug": "recall-senatran",
    "nome": "Recall por Chassi via Senatran",
    "categoria": "veicular",
    "preco": 0.45,
    "entrada": "Chassi",
    "pdf": false
  },
  {
    "slug": "renajud-senatran",
    "nome": "Restrições Renajud por Placa via Senatran",
    "categoria": "veicular",
    "preco": 0.45,
    "entrada": "Placa do veículo",
    "pdf": false
  },
  {
    "slug": "fipe-veiculo",
    "nome": "Tabela Fipe — Valor de Veículo",
    "categoria": "veicular",
    "preco": 0.69,
    "entrada": "CPF ou CNPJ",
    "pdf": true
  },
  {
    "slug": "bin-chassi",
    "nome": "Veículo Base BIN (chassi)",
    "categoria": "veicular",
    "preco": 0.09,
    "entrada": "Chassi",
    "pdf": false
  },
  {
    "slug": "bin-motor",
    "nome": "Veículo Base BIN (motor)",
    "categoria": "veicular",
    "preco": 0.09,
    "entrada": "Número do motor",
    "pdf": false
  },
  {
    "slug": "bin-placa",
    "nome": "Veículo Base BIN (placa)",
    "categoria": "veicular",
    "preco": 0.09,
    "entrada": "Placa do veículo",
    "pdf": false
  },
  {
    "slug": "bin-renavam",
    "nome": "Veículo Base BIN (renavam)",
    "categoria": "veicular",
    "preco": 0.09,
    "entrada": "Renavam",
    "pdf": false
  },
  {
    "slug": "veiculo-essencial",
    "nome": "Veículo Essencial",
    "categoria": "veicular",
    "preco": 30.24,
    "entrada": "Placa do veículo",
    "pdf": false
  },
  {
    "slug": "chassi-senatran",
    "nome": "Veículo por Chassi via Senatran",
    "categoria": "veicular",
    "preco": 0.6,
    "entrada": "Chassi",
    "pdf": false
  },
  {
    "slug": "motor-senatran",
    "nome": "Veículo por Motor via Senatran",
    "categoria": "veicular",
    "preco": 0.6,
    "entrada": "Número do motor",
    "pdf": false
  },
  {
    "slug": "placa-senatran",
    "nome": "Veículo por Placa via Senatran",
    "categoria": "veicular",
    "preco": 0.6,
    "entrada": "Placa do veículo",
    "pdf": false
  }
];

export const CONSULTAS_CATEGORIAS = Array.from(
  new Set(CONSULTAS_CATALOGO.map((p) => p.categoria)),
).sort();

export function consultasPorCategoria(categoria: string) {
  return CONSULTAS_CATALOGO.filter((p) => p.categoria === categoria);
}

export function acharConsulta(slug: string) {
  return CONSULTAS_CATALOGO.find((p) => p.slug === slug) ?? null;
}
