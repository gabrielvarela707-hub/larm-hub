/**
 * Regras isoladas do rateio de Contas a Pagar.
 *
 * Este módulo não grava no banco. Ele valida as partes do rateio e divide as
 * parcelas em centavos, preservando simultaneamente:
 * - o total de cada parcela do documento;
 * - o total destinado a cada conta do rateio.
 */

const MAX_RATEIO_ITEMS = 20;
const PERCENT_SCALE = 1_000_000;
const HUNDRED_PERCENT_SCALED = 100 * PERCENT_SCALE;

function parseDecimal(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;

  const raw = String(value).trim();
  if (!raw) return fallback;

  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const number = Number(normalized.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : fallback;
}

function moneyToCents(value) {
  const cents = Math.round((parseDecimal(value, 0) + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents)) {
    throw cpRateioError("O valor informado ultrapassa o limite seguro para cálculo em centavos.");
  }
  return cents;
}

function centsToMoney(value) {
  return Number((Number(value || 0) / 100).toFixed(2));
}

function cpRateioError(message, statusCode = 400, code = "RATEIO_INVALIDO") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function normalizeRateioItems(rateios, valorTotal) {
  if (!Array.isArray(rateios) || rateios.length === 0) return [];
  if (rateios.length < 2) {
    throw cpRateioError("O rateio precisa ter pelo menos duas contas.");
  }
  if (rateios.length > MAX_RATEIO_ITEMS) {
    throw cpRateioError(`O rateio aceita no máximo ${MAX_RATEIO_ITEMS} contas por documento.`);
  }

  const totalCents = moneyToCents(valorTotal);
  if (totalCents <= 0) {
    throw cpRateioError("O valor total do documento deve ser maior que zero.");
  }

  const items = rateios.map((item, index) => {
    const bancoContaId = Number(item?.banco_conta_id);
    const valueCents = moneyToCents(item?.valor);
    const percentual = parseDecimal(item?.percentual, 0);
    const percentualScaled = Math.round(percentual * PERCENT_SCALE);
    const empresa = String(item?.empresa || "").trim().toUpperCase();

    if (!Number.isInteger(bancoContaId) || bancoContaId <= 0) {
      throw cpRateioError(
        `Rateio ${index + 1}: selecione uma conta bancária cadastrada.`,
      );
    }
    if (valueCents <= 0) {
      throw cpRateioError(`Rateio ${index + 1}: informe um valor maior que zero.`);
    }
    if (percentualScaled <= 0 || percentualScaled > HUNDRED_PERCENT_SCALED) {
      throw cpRateioError(
        `Rateio ${index + 1}: informe um percentual maior que zero e menor ou igual a 100%.`,
      );
    }

    return {
      ordem: index + 1,
      empresa,
      banco_conta_id: bancoContaId,
      percentual: Number((percentualScaled / PERCENT_SCALE).toFixed(6)),
      percentual_scaled: percentualScaled,
      valor: centsToMoney(valueCents),
      valor_centavos: valueCents,
    };
  });

  const uniqueAccounts = new Set(items.map((item) => item.banco_conta_id));
  if (uniqueAccounts.size !== items.length) {
    throw cpRateioError("A mesma conta bancária não pode aparecer duas vezes no rateio.");
  }

  const valueSum = items.reduce((total, item) => total + item.valor_centavos, 0);
  if (valueSum !== totalCents) {
    throw cpRateioError(
      `A soma dos valores do rateio deve ser igual ao valor total do documento (${centsToMoney(totalCents).toFixed(2)}).`,
    );
  }

  const percentageSum = items.reduce(
    (total, item) => total + item.percentual_scaled,
    0,
  );
  if (percentageSum !== HUNDRED_PERCENT_SCALED) {
    throw cpRateioError("A soma dos percentuais do rateio deve ser exatamente 100%.");
  }

  const percentageScaleBigInt = BigInt(HUNDRED_PERCENT_SCALED);
  const inconsistentItem = items.find((item) => {
    const informed = BigInt(item.valor_centavos) * percentageScaleBigInt;
    const expected = BigInt(totalCents) * BigInt(item.percentual_scaled);
    const difference = informed >= expected
      ? informed - expected
      : expected - informed;
    return difference > percentageScaleBigInt;
  });
  if (inconsistentItem) {
    throw cpRateioError(
      `Rateio ${inconsistentItem.ordem}: o percentual e o valor informado não correspondem entre si.`,
    );
  }

  return items;
}

async function hydrateRateioAccounts(client, items) {
  if (!items.length) return [];

  const ids = items.map((item) => item.banco_conta_id);
  const { rows } = await client.query(
    `SELECT id, empresa, banco_nome, codigo_banco, agencia, conta, digito, tipo_conta
       FROM fin_bancos_contas
      WHERE id = ANY($1::int[])
        AND ativo = true`,
    [ids],
  );
  const byId = new Map(rows.map((row) => [Number(row.id), row]));

  return items.map((item, index) => {
    const account = byId.get(item.banco_conta_id);
    if (!account) {
      throw cpRateioError(
        `Rateio ${index + 1}: conta bancária não encontrada ou inativa.`,
      );
    }

    const accountCompany = String(account.empresa || "").trim().toUpperCase();
    if (!accountCompany) {
      throw cpRateioError(
        `Rateio ${index + 1}: a conta bancária não possui empresa vinculada.`,
      );
    }
    if (item.empresa && item.empresa !== accountCompany) {
      throw cpRateioError(
        `Rateio ${index + 1}: a conta selecionada pertence à empresa ${accountCompany}.`,
      );
    }

    return {
      ...item,
      empresa: accountCompany,
      conta: account,
    };
  });
}

function allocateCents(totalCents, weights) {
  const numericTotal = Number(totalCents) || 0;
  if (!Number.isSafeInteger(numericTotal)) {
    throw cpRateioError("O total em centavos ultrapassa o limite seguro de cálculo.", 500);
  }
  const safeTotal = Math.max(0, Math.trunc(numericTotal));
  const normalizedWeights = weights.map((weight) => {
    const numericWeight = Number(weight) || 0;
    if (!Number.isSafeInteger(numericWeight)) {
      throw cpRateioError("Uma proporção do rateio ultrapassa o limite seguro de cálculo.", 500);
    }
    return Math.max(0, Math.trunc(numericWeight));
  });
  const weightSum = normalizedWeights.reduce((total, weight) => total + weight, 0);

  if (safeTotal === 0) return normalizedWeights.map(() => 0);
  if (weightSum <= 0) {
    throw cpRateioError("Não foi possível calcular a proporção do rateio.", 500);
  }

  const totalBigInt = BigInt(safeTotal);
  const weightSumBigInt = BigInt(weightSum);
  const allocations = normalizedWeights.map((weight, index) => {
    const numerator = totalBigInt * BigInt(weight);
    return {
      index,
      value: Number(numerator / weightSumBigInt),
      remainder: numerator % weightSumBigInt,
    };
  });
  const result = allocations.map((allocation) => allocation.value);
  let remainder = safeTotal - result.reduce((total, value) => total + value, 0);

  const order = [...allocations].sort((a, b) => {
    if (a.remainder === b.remainder) return a.index - b.index;
    return a.remainder > b.remainder ? -1 : 1;
  });

  let cursor = 0;
  while (remainder > 0) {
    result[order[cursor % order.length].index] += 1;
    remainder -= 1;
    cursor += 1;
  }

  return result;
}

function allocateMatrixCents(rowTotals, columnTotals) {
  const rows = rowTotals.map((value) => Math.max(0, Math.trunc(Number(value) || 0)));
  const columns = columnTotals.map((value) =>
    Math.max(0, Math.trunc(Number(value) || 0)),
  );
  const rowSum = rows.reduce((total, value) => total + value, 0);
  const columnSum = columns.reduce((total, value) => total + value, 0);

  if (rowSum !== columnSum) {
    throw cpRateioError(
      "A soma das parcelas não corresponde ao valor total distribuído no rateio.",
    );
  }

  const matrix = rows.map((rowTotal) => allocateCents(rowTotal, columns));
  const currentColumns = columns.map((_, columnIndex) =>
    matrix.reduce((total, row) => total + row[columnIndex], 0),
  );
  const differences = columns.map(
    (target, columnIndex) => target - currentColumns[columnIndex],
  );

  for (let underIndex = 0; underIndex < differences.length; underIndex += 1) {
    while (differences[underIndex] > 0) {
      const overIndex = differences.findIndex((difference) => difference < 0);
      if (overIndex < 0) {
        throw cpRateioError("Falha interna ao ajustar os centavos do rateio.", 500);
      }

      const rowIndex = matrix.findIndex((row) => row[overIndex] > 0);
      if (rowIndex < 0) {
        throw cpRateioError("Falha interna ao preservar os totais do rateio.", 500);
      }

      const amount = Math.min(
        differences[underIndex],
        -differences[overIndex],
        matrix[rowIndex][overIndex],
      );
      matrix[rowIndex][overIndex] -= amount;
      matrix[rowIndex][underIndex] += amount;
      differences[overIndex] += amount;
      differences[underIndex] -= amount;
    }
  }

  return matrix;
}

const PARCELA_MONEY_FIELDS = [
  "acrescimo",
  "desconto",
  "retencao_ipi",
  "retencao_iss",
  "retencao_icms",
  "retencao_pis",
  "retencao_cofins",
  "retencao_csll",
  "retencao_irrf",
  "retencao_inss",
  "juros",
  "multa",
  "valor_final",
];

function splitParcelasByRateio(parcelas, items, valorTotal) {
  if (!Array.isArray(parcelas) || parcelas.length === 0) {
    throw cpRateioError("O documento precisa possuir pelo menos uma parcela.");
  }
  if (!Array.isArray(items) || items.length < 2) {
    throw cpRateioError("O rateio precisa ter pelo menos duas contas.");
  }

  const totalCents = moneyToCents(valorTotal);
  const rowTotals = parcelas.map((parcela) => moneyToCents(parcela?.valor));
  const parcelSum = rowTotals.reduce((total, value) => total + value, 0);
  if (parcelSum !== totalCents) {
    throw cpRateioError(
      "A soma dos valores das parcelas deve ser igual ao valor total do documento antes de aplicar o rateio.",
    );
  }

  const columnTotals = items.map((item) => item.valor_centavos);
  const valueMatrix = allocateMatrixCents(rowTotals, columnTotals);
  const result = items.map(() => []);

  parcelas.forEach((parcela, rowIndex) => {
    const distributedFields = Object.fromEntries(
      PARCELA_MONEY_FIELDS.map((field) => [
        field,
        allocateCents(moneyToCents(parcela?.[field]), columnTotals),
      ]),
    );

    items.forEach((_, columnIndex) => {
      const split = {
        ...parcela,
        id: null,
        status: "pendente",
        valor: centsToMoney(valueMatrix[rowIndex][columnIndex]),
      };
      PARCELA_MONEY_FIELDS.forEach((field) => {
        split[field] = centsToMoney(distributedFields[field][columnIndex]);
      });
      result[columnIndex].push(split);
    });
  });

  result.forEach((splitParcelas, index) => {
    const splitTotal = splitParcelas.reduce(
      (total, parcela) => total + moneyToCents(parcela.valor),
      0,
    );
    if (splitTotal !== items[index].valor_centavos) {
      throw cpRateioError("Falha interna ao conferir o total individual do rateio.", 500);
    }
  });

  return result;
}

module.exports = {
  MAX_RATEIO_ITEMS,
  moneyToCents,
  centsToMoney,
  cpRateioError,
  normalizeRateioItems,
  hydrateRateioAccounts,
  allocateCents,
  allocateMatrixCents,
  splitParcelasByRateio,
};
