-- Diagnóstico somente leitura: não altera dados.
SELECT
  lote_importacao,
  COUNT(*)::int AS registros,
  COUNT(*) FILTER (WHERE ano=2026 AND mes=6 AND dia=26)::int AS dia_26,
  COUNT(*) FILTER (WHERE ano=2026 AND mes=6 AND dia=29)::int AS dia_29,
  COUNT(*) FILTER (WHERE ano=2026 AND mes=6 AND dia=30)::int AS dia_30,
  COALESCE(SUM(entradas),0) AS entradas,
  COALESCE(SUM(saidas),0) AS saidas
FROM fin_movimento
WHERE lote_importacao IN (
  'MOV-2026-ATE-0107-20260702020021',
  'MOV-2026-20260629-30-0379',
  'MOV-2026-20260629-30-0383',
  'MOV-2026-20260626-30-0384',
  'MOV-2026-20260629-30-0385'
)
GROUP BY lote_importacao
ORDER BY lote_importacao;
