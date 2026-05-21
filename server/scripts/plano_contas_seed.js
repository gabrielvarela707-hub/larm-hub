/**
 * server/src/data/plano_contas_seed.js
 * Dados importados da planilha "Plano de contas financeiro.xlsx".
 * Mantido separado para o CRUD e o seed usarem a mesma origem.
 */

const PLANO_CONTAS_SEED = [
  {
    "codigo": "1.",
    "descricao": "RECEITAS OPERACIONAIS",
    "tipo": "T",
    "pai_codigo": null
  },
  {
    "codigo": "1.1",
    "descricao": "VENDA DE IMÓVEIS",
    "tipo": "S",
    "pai_codigo": "1."
  },
  {
    "codigo": "1.1.1",
    "descricao": "Residencial Santa Clara",
    "tipo": "A",
    "pai_codigo": "1.1"
  },
  {
    "codigo": "1.1.2",
    "descricao": "Residencial Santa Adélia",
    "tipo": "A",
    "pai_codigo": "1.1"
  },
  {
    "codigo": "1.1.3",
    "descricao": "Residencial Santa Clara II",
    "tipo": "A",
    "pai_codigo": "1.1"
  },
  {
    "codigo": "1.2",
    "descricao": "ALUGUÉIS",
    "tipo": "S",
    "pai_codigo": "1."
  },
  {
    "codigo": "1.2.1",
    "descricao": "Conjunto 23",
    "tipo": "A",
    "pai_codigo": "1.2"
  },
  {
    "codigo": "1.2.2",
    "descricao": "Apto. Vila Mariana",
    "tipo": "A",
    "pai_codigo": "1.2"
  },
  {
    "codigo": "1.2.3",
    "descricao": "Global Link",
    "tipo": "A",
    "pai_codigo": "1.2"
  },
  {
    "codigo": "1.3",
    "descricao": "VENDA DE MARCADORIAS/GADO",
    "tipo": "S",
    "pai_codigo": "1."
  },
  {
    "codigo": "1.3.1",
    "descricao": "Venda de Gado",
    "tipo": "A",
    "pai_codigo": "1.3"
  },
  {
    "codigo": "1.3.2",
    "descricao": "Venda de Madeira",
    "tipo": "A",
    "pai_codigo": "1.3"
  },
  {
    "codigo": "1.4",
    "descricao": "OUTRAS RECEITAS OPERACIONAIS",
    "tipo": "S",
    "pai_codigo": "1."
  },
  {
    "codigo": "1.4.1",
    "descricao": "Rendimentos de Pro-Labore",
    "tipo": "A",
    "pai_codigo": "1.4"
  },
  {
    "codigo": "1.4.2",
    "descricao": "Aposentadoria LM",
    "tipo": "A",
    "pai_codigo": "1.4"
  },
  {
    "codigo": "1.4.3",
    "descricao": "Aposentadoria RM",
    "tipo": "A",
    "pai_codigo": "1.4"
  },
  {
    "codigo": "1.4.4",
    "descricao": "OUTRAS RECEITAS OPERACIONAIS",
    "tipo": "A",
    "pai_codigo": "1.4"
  },
  {
    "codigo": "1.9",
    "descricao": "VENDAS CANCELADAS",
    "tipo": "S",
    "pai_codigo": "1."
  },
  {
    "codigo": "1.9.1",
    "descricao": "Distrato Santa Clara",
    "tipo": "A",
    "pai_codigo": "1.9"
  },
  {
    "codigo": "1.9.2",
    "descricao": "Distrato Santa Adélia",
    "tipo": "A",
    "pai_codigo": "1.9"
  },
  {
    "codigo": "1.9.3",
    "descricao": "Distrato Santa Clara II",
    "tipo": "A",
    "pai_codigo": "1.9"
  },
  {
    "codigo": "2.",
    "descricao": "IMPOSTOS S/ FATURAMENTO",
    "tipo": "T",
    "pai_codigo": null
  },
  {
    "codigo": "2.1",
    "descricao": "IMPOSTOS S/ VENDAS",
    "tipo": "S",
    "pai_codigo": "2."
  },
  {
    "codigo": "2.1.1",
    "descricao": "PIS",
    "tipo": "A",
    "pai_codigo": "2.1"
  },
  {
    "codigo": "2.1.2",
    "descricao": "COFINS",
    "tipo": "A",
    "pai_codigo": "2.1"
  },
  {
    "codigo": "2.1.3",
    "descricao": "IRPJ",
    "tipo": "A",
    "pai_codigo": "2.1"
  },
  {
    "codigo": "2.1.4",
    "descricao": "CSLL",
    "tipo": "A",
    "pai_codigo": "2.1"
  },
  {
    "codigo": "3.",
    "descricao": "CUSTOS",
    "tipo": "T",
    "pai_codigo": null
  },
  {
    "codigo": "3.1",
    "descricao": "CUSTO DOS IMOVEIS",
    "tipo": "S",
    "pai_codigo": "3."
  },
  {
    "codigo": "3.1.1",
    "descricao": "CUSTO DOS IMOVEIS VENDIDOS",
    "tipo": "A",
    "pai_codigo": "3.1"
  },
  {
    "codigo": "3.2",
    "descricao": "CMV",
    "tipo": "S",
    "pai_codigo": "3."
  },
  {
    "codigo": "3.2.1",
    "descricao": "Custo das Mercadorias Vendidas",
    "tipo": "A",
    "pai_codigo": "3.2"
  },
  {
    "codigo": "4.",
    "descricao": "DESPESAS OPERACIONAIS",
    "tipo": "T",
    "pai_codigo": null
  },
  {
    "codigo": "4.1",
    "descricao": "DESPESAS COM PESSOAL (1)",
    "tipo": "S",
    "pai_codigo": "4."
  },
  {
    "codigo": "4.1.1",
    "descricao": "PRO-LABORE",
    "tipo": "A",
    "pai_codigo": "4.1"
  },
  {
    "codigo": "4.1.2",
    "descricao": "SALÁRIOS E ORDENADOS",
    "tipo": "A",
    "pai_codigo": "4.1"
  },
  {
    "codigo": "4.1.3",
    "descricao": "HORAS EXTRAS",
    "tipo": "A",
    "pai_codigo": "4.1"
  },
  {
    "codigo": "4.1.4",
    "descricao": "FÉRIAS",
    "tipo": "A",
    "pai_codigo": "4.1"
  },
  {
    "codigo": "4.1.5",
    "descricao": "13o. SALARIO",
    "tipo": "A",
    "pai_codigo": "4.1"
  },
  {
    "codigo": "4.1.6",
    "descricao": "INSS",
    "tipo": "A",
    "pai_codigo": "4.1"
  },
  {
    "codigo": "4.1.7",
    "descricao": "FGTS",
    "tipo": "A",
    "pai_codigo": "4.1"
  },
  {
    "codigo": "4.1.9",
    "descricao": "ALIMENTAÇÃO DO TRABALHADOR",
    "tipo": "A",
    "pai_codigo": "4.1"
  },
  {
    "codigo": "4.1.10",
    "descricao": "VALE TRANSPORTE",
    "tipo": "A",
    "pai_codigo": "4.1"
  },
  {
    "codigo": "4.1.12",
    "descricao": "RESCISÃO",
    "tipo": "A",
    "pai_codigo": "4.1"
  },
  {
    "codigo": "4.1.13",
    "descricao": "VALE REFEIÇÃO",
    "tipo": "A",
    "pai_codigo": "4.1"
  },
  {
    "codigo": "4.1.14",
    "descricao": "DESPESAS EXTRAS/REEMB. FERNANDO",
    "tipo": "A",
    "pai_codigo": "4.1"
  },
  {
    "codigo": "4.5.8",
    "descricao": "SERVIÇOS ADMINISTRATIVOS",
    "tipo": "A",
    "pai_codigo": "4.5"
  },
  {
    "codigo": "4.2",
    "descricao": "OCUPACÃO (2)",
    "tipo": "S",
    "pai_codigo": "4."
  },
  {
    "codigo": "4.2.1",
    "descricao": "ALUGUEIS E CONDOMINIOS",
    "tipo": "A",
    "pai_codigo": "4.2"
  },
  {
    "codigo": "4.2.2",
    "descricao": "SEGUROS RISCOS DIVERSOS",
    "tipo": "A",
    "pai_codigo": "4.2"
  },
  {
    "codigo": "4.2.3",
    "descricao": "MANUTENÇÕES E PEQUENOS CONSERTOS",
    "tipo": "A",
    "pai_codigo": "4.2"
  },
  {
    "codigo": "4.3",
    "descricao": "UTILIDADES E SERVICOS (3)",
    "tipo": "S",
    "pai_codigo": "4."
  },
  {
    "codigo": "4.3.1",
    "descricao": "ENERGIA ELÉTRICA",
    "tipo": "A",
    "pai_codigo": "4.3"
  },
  {
    "codigo": "4.3.2",
    "descricao": "TELEFONE",
    "tipo": "A",
    "pai_codigo": "4.3"
  },
  {
    "codigo": "4.3.3",
    "descricao": "CORREIOS E MALOTES",
    "tipo": "A",
    "pai_codigo": "4.3"
  },
  {
    "codigo": "4.3.4",
    "descricao": "INTERNET",
    "tipo": "A",
    "pai_codigo": "4.3"
  },
  {
    "codigo": "4.3.5",
    "descricao": "CARTORARIAS",
    "tipo": "A",
    "pai_codigo": "4.3"
  },
  {
    "codigo": "4.3.6",
    "descricao": "CONSUMO DE AGUA",
    "tipo": "A",
    "pai_codigo": "4.3"
  },
  {
    "codigo": "4.3.7",
    "descricao": "GÁS",
    "tipo": "A",
    "pai_codigo": "4.3"
  },
  {
    "codigo": "4.4",
    "descricao": "DESPESAS GERAIS/TERCEIROS (4)",
    "tipo": "S",
    "pai_codigo": "4."
  },
  {
    "codigo": "4.4.1",
    "descricao": "MATERIAL DE ESCRITORIO",
    "tipo": "A",
    "pai_codigo": "4.4"
  },
  {
    "codigo": "4.4.2",
    "descricao": "MATERIAIS AUXILIARES DE CONSUMO",
    "tipo": "A",
    "pai_codigo": "4.4"
  },
  {
    "codigo": "4.4.3",
    "descricao": "COPA",
    "tipo": "A",
    "pai_codigo": "4.4"
  },
  {
    "codigo": "4.4.4",
    "descricao": "CONDUCOES E LANCHES",
    "tipo": "A",
    "pai_codigo": "4.4"
  },
  {
    "codigo": "4.4.5",
    "descricao": "REVISTAS E PUBLICACOES",
    "tipo": "A",
    "pai_codigo": "4.4"
  },
  {
    "codigo": "4.4.6",
    "descricao": "ACADEMIAS, CLUBES E OFICINAS DE ARTES",
    "tipo": "A",
    "pai_codigo": "4.4"
  },
  {
    "codigo": "4.4.7",
    "descricao": "HIGIENE, LIMPEZA E CONSERVACAO",
    "tipo": "A",
    "pai_codigo": "4.4"
  },
  {
    "codigo": "4.4.8",
    "descricao": "ASSINATURAS/JORNAIS/PUBLICACOES",
    "tipo": "A",
    "pai_codigo": "4.4"
  },
  {
    "codigo": "4.4.9",
    "descricao": "ASSOCIAÇÃO DE CLASSE",
    "tipo": "A",
    "pai_codigo": "4.4"
  },
  {
    "codigo": "4.4.10",
    "descricao": "BENS DE NATUREZA PERMANENTE",
    "tipo": "A",
    "pai_codigo": "4.4"
  },
  {
    "codigo": "4.4.11",
    "descricao": "LICENÇA DE USO",
    "tipo": "A",
    "pai_codigo": "4.4"
  },
  {
    "codigo": "4.4.14",
    "descricao": "GASTOS DIVERSOS",
    "tipo": "A",
    "pai_codigo": "4.4"
  },
  {
    "codigo": "4.4.15",
    "descricao": "SUPRIMENTO DE CAIXA",
    "tipo": "A",
    "pai_codigo": "4.4"
  },
  {
    "codigo": "4.5",
    "descricao": "SERVICOS PROFISSIONAIS (5)",
    "tipo": "S",
    "pai_codigo": "4."
  },
  {
    "codigo": "4.5.1",
    "descricao": "ADVOCATÍCIOS",
    "tipo": "A",
    "pai_codigo": "4.5"
  },
  {
    "codigo": "4.5.2",
    "descricao": "CONSULTORIA E ASSESSORIA EMPRESARIAL",
    "tipo": "A",
    "pai_codigo": "4.5"
  },
  {
    "codigo": "4.5.3",
    "descricao": "CONSULTORIA E ASSESSORIA TECNICA",
    "tipo": "A",
    "pai_codigo": "4.5"
  },
  {
    "codigo": "4.5.4",
    "descricao": "CONTÁBEIS",
    "tipo": "A",
    "pai_codigo": "4.5"
  },
  {
    "codigo": "4.5.5",
    "descricao": "FRETES E CARRETOS",
    "tipo": "A",
    "pai_codigo": "4.5"
  },
  {
    "codigo": "4.5.6",
    "descricao": "PROCESSAMENTOS DE DADOS",
    "tipo": "A",
    "pai_codigo": "4.5"
  },
  {
    "codigo": "4.5.7",
    "descricao": "SEGURANÇA E VIGILÂNCIA",
    "tipo": "A",
    "pai_codigo": "4.5"
  },
  {
    "codigo": "4.5.9",
    "descricao": "SERVIÇOS DE ENTREGAS",
    "tipo": "A",
    "pai_codigo": "4.5"
  },
  {
    "codigo": "4.5.10",
    "descricao": "SERVIÇOS GRÁFICOS",
    "tipo": "A",
    "pai_codigo": "4.5"
  },
  {
    "codigo": "4.5.11",
    "descricao": "SUPORTE TÉCNICO EM TELECOMUNICAÇÃO",
    "tipo": "A",
    "pai_codigo": "4.5"
  },
  {
    "codigo": "4.5.12",
    "descricao": "SUPORTE TÉCNICO INFORMÁTICA",
    "tipo": "A",
    "pai_codigo": "4.5"
  },
  {
    "codigo": "4.5.13",
    "descricao": "OUTROS SERVICOS P.J.",
    "tipo": "A",
    "pai_codigo": "4.5"
  },
  {
    "codigo": "4.6",
    "descricao": "DESPESAS DE VIAGENS (6)",
    "tipo": "S",
    "pai_codigo": "4."
  },
  {
    "codigo": "4.6.1",
    "descricao": "PASSAGENS",
    "tipo": "A",
    "pai_codigo": "4.6"
  },
  {
    "codigo": "4.6.2",
    "descricao": "HOSPEDAGENS",
    "tipo": "A",
    "pai_codigo": "4.6"
  },
  {
    "codigo": "4.6.3",
    "descricao": "DIÁRIAS, TRANPORTE E ALIMENTAÇÃO",
    "tipo": "A",
    "pai_codigo": "4.6"
  },
  {
    "codigo": "4.6.4",
    "descricao": "ESTACIONAMENTO/PEDAGIO/QUILOMETRAGEM",
    "tipo": "A",
    "pai_codigo": "4.6"
  },
  {
    "codigo": "4.7",
    "descricao": "DESPESAS COM VEÍCULOS (7)",
    "tipo": "S",
    "pai_codigo": "4."
  },
  {
    "codigo": "4.7.1",
    "descricao": "COMBUSTIVEIS E LUBRIFICANTES",
    "tipo": "A",
    "pai_codigo": "4.7"
  },
  {
    "codigo": "4.7.2",
    "descricao": "MANUTENÇÃO E REPARO DE VEÍCULOS",
    "tipo": "A",
    "pai_codigo": "4.7"
  },
  {
    "codigo": "4.7.3",
    "descricao": "ESTACIONAMENTO DE VEÍCULOS",
    "tipo": "A",
    "pai_codigo": "4.7"
  },
  {
    "codigo": "4.7.4",
    "descricao": "LAVAGEM E HIGIENIZAÇÃO",
    "tipo": "A",
    "pai_codigo": "4.7"
  },
  {
    "codigo": "4.7.5",
    "descricao": "SEGURO DE VEÍCULOS",
    "tipo": "A",
    "pai_codigo": "4.7"
  },
  {
    "codigo": "4.7.6",
    "descricao": "TAXAS,LICENCIAMENTO",
    "tipo": "A",
    "pai_codigo": "4.7"
  },
  {
    "codigo": "4.8",
    "descricao": "DESPESAS COMERCIAIS (8)",
    "tipo": "S",
    "pai_codigo": "4."
  },
  {
    "codigo": "4.8.1",
    "descricao": "PROMOÇÃO DE VENDAS",
    "tipo": "A",
    "pai_codigo": "4.8"
  },
  {
    "codigo": "4.8.2",
    "descricao": "SERVIÇO DE PROTEÇÃO AO CRÉDITO",
    "tipo": "A",
    "pai_codigo": "4.8"
  },
  {
    "codigo": "4.9",
    "descricao": "IMPOSTOS E TAXAS (9)",
    "tipo": "S",
    "pai_codigo": "4."
  },
  {
    "codigo": "4.9.1",
    "descricao": "IPVA",
    "tipo": "A",
    "pai_codigo": "4.9"
  },
  {
    "codigo": "4.9.2",
    "descricao": "IPTU",
    "tipo": "A",
    "pai_codigo": "4.9"
  },
  {
    "codigo": "4.9.3",
    "descricao": "ISS",
    "tipo": "A",
    "pai_codigo": "4.9"
  },
  {
    "codigo": "4.9.4",
    "descricao": "IRRF",
    "tipo": "A",
    "pai_codigo": "4.9"
  },
  {
    "codigo": "4.9.5",
    "descricao": "CSRF",
    "tipo": "A",
    "pai_codigo": "4.9"
  },
  {
    "codigo": "4.9.6",
    "descricao": "IRRF S/ SALÁRIOS",
    "tipo": "A",
    "pai_codigo": "4.9"
  },
  {
    "codigo": "4.9.7",
    "descricao": "CONTRIBUICÃO SINDICAL",
    "tipo": "A",
    "pai_codigo": "4.9"
  },
  {
    "codigo": "4.9.8",
    "descricao": "OUTROS IMPOSTOS E TAXAS",
    "tipo": "A",
    "pai_codigo": "4.9"
  },
  {
    "codigo": "4.10",
    "descricao": "DESPESAS INDEDUTIVEIS (10)",
    "tipo": "S",
    "pai_codigo": "4."
  },
  {
    "codigo": "4.10.1",
    "descricao": "MULTA DE TRÂNSITO",
    "tipo": "A",
    "pai_codigo": "4.10"
  },
  {
    "codigo": "4.10.2",
    "descricao": "DESPESAS INDEDUTIVEIS",
    "tipo": "A",
    "pai_codigo": "4.10"
  },
  {
    "codigo": "4.11",
    "descricao": "CUSTO DO GADO (11)",
    "tipo": "S",
    "pai_codigo": "4."
  },
  {
    "codigo": "4.11.1",
    "descricao": "MANUTENÇÃO DO GADO",
    "tipo": "A",
    "pai_codigo": "4.11"
  },
  {
    "codigo": "4.11.2",
    "descricao": "PASTAGENS",
    "tipo": "A",
    "pai_codigo": "4.11"
  },
  {
    "codigo": "4.11.3",
    "descricao": "DESPESAS DE VETERINÁRIA",
    "tipo": "A",
    "pai_codigo": "4.11"
  },
  {
    "codigo": "4.12",
    "descricao": "DESPESAS MÉDICAS (12)",
    "tipo": "S",
    "pai_codigo": "4."
  },
  {
    "codigo": "4.12.1",
    "descricao": "DESPESAS MÉDICAS",
    "tipo": "A",
    "pai_codigo": "4.12"
  },
  {
    "codigo": "4.12.2",
    "descricao": "ASSISTÊNCIA MÉDICA",
    "tipo": "A",
    "pai_codigo": "4.12"
  },
  {
    "codigo": "4.12.3",
    "descricao": "DESP. COM FARMÁCIAS",
    "tipo": "A",
    "pai_codigo": "4.12"
  },
  {
    "codigo": "5.",
    "descricao": "Resultado Financeiro",
    "tipo": "T",
    "pai_codigo": null
  },
  {
    "codigo": "5.1",
    "descricao": "RECEITAS FINANCEIRAS",
    "tipo": "S",
    "pai_codigo": "5."
  },
  {
    "codigo": "5.1.1",
    "descricao": "DESCONTOS OBTIDOS",
    "tipo": "A",
    "pai_codigo": "5.1"
  },
  {
    "codigo": "5.1.2",
    "descricao": "JUROS RECEBIDOS OU AUFERIDOS",
    "tipo": "A",
    "pai_codigo": "5.1"
  },
  {
    "codigo": "5.1.3",
    "descricao": "REND. S/APLICACOES FINANCEIRAS",
    "tipo": "A",
    "pai_codigo": "5.1"
  },
  {
    "codigo": "5.1.4",
    "descricao": "VARIACAO MONETARIA ATIVA",
    "tipo": "A",
    "pai_codigo": "5.1"
  },
  {
    "codigo": "5.2",
    "descricao": "DESPESAS FINANCEIRAS",
    "tipo": "S",
    "pai_codigo": "5."
  },
  {
    "codigo": "5.2.1",
    "descricao": "JUROS PAGOS OU INCORRIDOS",
    "tipo": "A",
    "pai_codigo": "5.2"
  },
  {
    "codigo": "5.2.2",
    "descricao": "DESPESAS BANCARIAS E COMISSOES",
    "tipo": "A",
    "pai_codigo": "5.2"
  },
  {
    "codigo": "5.2.3",
    "descricao": "IOF",
    "tipo": "A",
    "pai_codigo": "5.2"
  },
  {
    "codigo": "5.2.4",
    "descricao": "ENCARGOS FINANCEIROS LIQUIDOS",
    "tipo": "A",
    "pai_codigo": "5.2"
  },
  {
    "codigo": "5.2.5",
    "descricao": "IRRF S/ APLICAÇÃO",
    "tipo": "A",
    "pai_codigo": "5.2"
  },
  {
    "codigo": "5.2.6",
    "descricao": "MULTAS POR ATRASO",
    "tipo": "A",
    "pai_codigo": "5.2"
  },
  {
    "codigo": "5.2.7",
    "descricao": "TRANSFERENCIAS ENTRE CONTAS",
    "tipo": "A",
    "pai_codigo": "5.2"
  },
  {
    "codigo": "6.",
    "descricao": "RESULTADO NÃO OPERACIONAL",
    "tipo": "T",
    "pai_codigo": null
  },
  {
    "codigo": "6.1",
    "descricao": "RECEITAS/DESPESAS NÃO OPERACIONAIS",
    "tipo": "S",
    "pai_codigo": "6."
  },
  {
    "codigo": "6.1.2",
    "descricao": "REEMBOLSO DE DESPESAS",
    "tipo": "A",
    "pai_codigo": "6.1"
  },
  {
    "codigo": "6.1.3",
    "descricao": "DESPESAS NÃO OPERACIONAIS",
    "tipo": "A",
    "pai_codigo": "6.1"
  },
  {
    "codigo": "6.1.4",
    "descricao": "DOAÇÕES",
    "tipo": "A",
    "pai_codigo": "6.1"
  },
  {
    "codigo": "7.",
    "descricao": "INVESTIMENTOS",
    "tipo": "T",
    "pai_codigo": null
  },
  {
    "codigo": "7.1",
    "descricao": "Aplicações CP",
    "tipo": "S",
    "pai_codigo": "7."
  },
  {
    "codigo": "7.1.1",
    "descricao": "APLICAÇÕES FINANCEIRAS",
    "tipo": "A",
    "pai_codigo": "7.1"
  },
  {
    "codigo": "7.1.2",
    "descricao": "CDB",
    "tipo": "A",
    "pai_codigo": "7.1"
  },
  {
    "codigo": "7.1.3",
    "descricao": "FUNDOS DE INVESTIMENTOS",
    "tipo": "A",
    "pai_codigo": "7.1"
  },
  {
    "codigo": "7.1.4",
    "descricao": "OUTROS INVESTIMENTOS",
    "tipo": "A",
    "pai_codigo": "7.1"
  },
  {
    "codigo": "7.2",
    "descricao": "Aplicações LP",
    "tipo": "S",
    "pai_codigo": "7."
  },
  {
    "codigo": "7.2.1",
    "descricao": "CDB-LP",
    "tipo": "A",
    "pai_codigo": "7.2"
  },
  {
    "codigo": "7.2.2",
    "descricao": "CRI-LP",
    "tipo": "A",
    "pai_codigo": "7.2"
  },
  {
    "codigo": "7.2.3",
    "descricao": "LCA-LP",
    "tipo": "A",
    "pai_codigo": "7.2"
  },
  {
    "codigo": "7.2.4",
    "descricao": "OUTROS INVESTIMENTOS-LP",
    "tipo": "A",
    "pai_codigo": "7.2"
  },
  {
    "codigo": "7.3",
    "descricao": "ATIVO IMOBILIZADO",
    "tipo": "S",
    "pai_codigo": "7."
  },
  {
    "codigo": "7.3.1",
    "descricao": "TERRENOS",
    "tipo": "A",
    "pai_codigo": "7.3"
  },
  {
    "codigo": "7.3.2",
    "descricao": "IMOVEIS",
    "tipo": "A",
    "pai_codigo": "7.3"
  },
  {
    "codigo": "7.3.3",
    "descricao": "MAQUINAS E EQUIPAMENTOS",
    "tipo": "A",
    "pai_codigo": "7.3"
  },
  {
    "codigo": "7.3.4",
    "descricao": "VEÍCULOS",
    "tipo": "A",
    "pai_codigo": "7.3"
  },
  {
    "codigo": "7.3.5",
    "descricao": "MÓVEIS E UTENSÍLIOS",
    "tipo": "A",
    "pai_codigo": "7.3"
  },
  {
    "codigo": "7.3.6",
    "descricao": "EQUIPAM. DE PROC. DE DADOS",
    "tipo": "A",
    "pai_codigo": "7.3"
  },
  {
    "codigo": "7.3.7",
    "descricao": "BENFEITORIAS",
    "tipo": "A",
    "pai_codigo": "7.3"
  },
  {
    "codigo": "7.3.8",
    "descricao": "DIREITO DE USO",
    "tipo": "A",
    "pai_codigo": "7.3"
  },
  {
    "codigo": "7.3.9",
    "descricao": "SISTEMA DE PROCESSAMENTO DE DADOS",
    "tipo": "A",
    "pai_codigo": "7.3"
  },
  {
    "codigo": "7.4",
    "descricao": "EMPRÉSTIMOS",
    "tipo": "A",
    "pai_codigo": "7."
  },
  {
    "codigo": "7.4.1",
    "descricao": "ADIANTAMENTO A TERCEIROS",
    "tipo": "A",
    "pai_codigo": "7.4"
  },
  {
    "codigo": "7.4.2",
    "descricao": "EMPRÉSTIMOS",
    "tipo": "A",
    "pai_codigo": "7.4"
  },
  {
    "codigo": "8.",
    "descricao": "ESTOQUES",
    "tipo": "T",
    "pai_codigo": null
  },
  {
    "codigo": "8.1",
    "descricao": "ED. FCO. MELAO-CJ 23",
    "tipo": "S",
    "pai_codigo": "8."
  },
  {
    "codigo": "8.2",
    "descricao": "ED. VENDOME-AP 131",
    "tipo": "S",
    "pai_codigo": "8."
  },
  {
    "codigo": "8.3",
    "descricao": "FAZENDA-SÃO MANOEL",
    "tipo": "S",
    "pai_codigo": "8."
  },
  {
    "codigo": "8.4",
    "descricao": "LOTEAMENTO-RES. SANTA CLARA",
    "tipo": "S",
    "pai_codigo": "8."
  },
  {
    "codigo": "8.5",
    "descricao": "LOTEAMENTO-RES. SANTA CLARA QY",
    "tipo": "S",
    "pai_codigo": "8."
  },
  {
    "codigo": "8.6",
    "descricao": "LOTEAMENTO-RES. SANTA CLARA QZ",
    "tipo": "S",
    "pai_codigo": "8."
  },
  {
    "codigo": "8.6.1",
    "descricao": "GRAPROHAB",
    "tipo": "A",
    "pai_codigo": "8.6"
  },
  {
    "codigo": "8.6.2",
    "descricao": "Serviços Preliminares",
    "tipo": "A",
    "pai_codigo": "8.6"
  },
  {
    "codigo": "8.6.3",
    "descricao": "Terraplenagem",
    "tipo": "A",
    "pai_codigo": "8.6"
  },
  {
    "codigo": "8.6.4",
    "descricao": "Drenagem de Águas Pluviais",
    "tipo": "A",
    "pai_codigo": "8.6"
  },
  {
    "codigo": "8.6.5",
    "descricao": "Abastecimento de água",
    "tipo": "A",
    "pai_codigo": "8.6"
  },
  {
    "codigo": "8.6.6",
    "descricao": "Rede de Coleta de Esgotos",
    "tipo": "A",
    "pai_codigo": "8.6"
  },
  {
    "codigo": "8.6.7",
    "descricao": "Guias e Sarjetas",
    "tipo": "A",
    "pai_codigo": "8.6"
  },
  {
    "codigo": "8.6.8",
    "descricao": "Pavimentação",
    "tipo": "A",
    "pai_codigo": "8.6"
  },
  {
    "codigo": "8.7",
    "descricao": "LOTEAMENTO-RES. SANTA CLARA II",
    "tipo": "A",
    "pai_codigo": "8."
  },
  {
    "codigo": "8.7.1",
    "descricao": "LOTEAMENTO-RES. SANTA CLARA II",
    "tipo": "A",
    "pai_codigo": "8.7"
  },
  {
    "codigo": "8.10",
    "descricao": "SEMOVENTES",
    "tipo": "S",
    "pai_codigo": "8."
  },
  {
    "codigo": "8.10.1",
    "descricao": "GADO",
    "tipo": "A",
    "pai_codigo": "8.10"
  },
  {
    "codigo": "8.10.2",
    "descricao": "EQUINOS",
    "tipo": "A",
    "pai_codigo": "8.10"
  },
  {
    "codigo": "8.11",
    "descricao": "CASA2-ESPERANÇA",
    "tipo": "S",
    "pai_codigo": "8."
  },
  {
    "codigo": "8.12",
    "descricao": "BRASIL AGRO II",
    "tipo": "A",
    "pai_codigo": "8."
  },
  {
    "codigo": "8.13",
    "descricao": "BRASIL AGRO III",
    "tipo": "A",
    "pai_codigo": "8."
  },
  {
    "codigo": "9",
    "descricao": "Distribuição de Lucros",
    "tipo": "A",
    "pai_codigo": null
  },
  {
    "codigo": "6.1.1",
    "descricao": "RESULTADO EM PARTICIPACAO SOCIETARIA",
    "tipo": "A",
    "pai_codigo": "6.1"
  }
]

module.exports = { PLANO_CONTAS_SEED }
