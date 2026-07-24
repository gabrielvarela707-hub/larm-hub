/*
  AUDITORIA SOMENTE LEITURA — CB230700 LUCKY
  Executar depois de restaurar o BKPTMP em uma instância SQL Server.
  Não cria, altera nem exclui dados.
*/
SET NOCOUNT ON;
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

IF OBJECT_ID(N'dbo.ts1_core', N'U') IS NULL
    THROW 50001, 'Tabela dbo.ts1_core não encontrada.', 1;
IF OBJECT_ID(N'dbo.ts1_bole', N'U') IS NULL
    THROW 50002, 'Tabela dbo.ts1_bole não encontrada.', 1;

PRINT '=== MARCIA — controle 101266 / parcela 052/120 ===';
SELECT
    c.core1_cod,
    c.vend1_cod,
    c.core1_doc_num,
    c.core1_dat_ven,
    c.core1_dat_pgt,
    c.core1_val_par,
    c.core1_val_pgt,
    c.core1_val_des,
    c.core1_val_emi,
    c.core1_val_emi_jfc,
    c.core1_val_emi_jur,
    c.core1_val_emi_mul,
    c.core1_val_emi_res,
    c.core1_val_emi_seg,
    b.bole1_cod,
    b.bole1_cli_cdclie,
    b.bole1_cli_nmclie,
    b.bole1_cor_cdobra,
    b.bole1_cor_nrapar AS unidade,
    b.bole1_cor_parcel AS composicao_boleto,
    b.bole1_cor_dtvenc,
    b.bole1_cor_dtpgto,
    b.bole1_cor_valor,
    b.bole1_cor_vlconv,
    b.bole1_cor_vldesc,
    b.bole1_cor_vljfct,
    b.bole1_cor_vljuro,
    b.bole1_cor_vlmult,
    b.bole1_cor_valres,
    b.bole1_cor_linedi,
    b.bole1_cor_codbar
FROM dbo.ts1_core c
LEFT JOIN dbo.ts1_bole b ON b.bole1_core1_cod = c.core1_cod
WHERE c.core1_cod = 101266
   OR (c.vend1_cod = 1203 AND c.core1_doc_num = '052/120')
ORDER BY b.bole1_cod DESC;

PRINT '=== BRIZA — parcelas 018/037 a 027/037 ===';
SELECT
    c.core1_cod,
    c.vend1_cod,
    c.core1_doc_num,
    c.core1_dat_ven,
    c.core1_dat_pgt,
    c.core1_val_par,
    c.core1_val_pgt,
    c.core1_val_des,
    c.core1_val_emi,
    c.core1_val_emi_jfc,
    c.core1_val_emi_jur,
    c.core1_val_emi_mul,
    c.core1_val_emi_res,
    c.core1_val_emi_seg,
    b.bole1_cod,
    b.bole1_cli_cdclie,
    b.bole1_cli_nmclie,
    b.bole1_cor_cdobra,
    b.bole1_cor_nrapar AS unidade,
    b.bole1_cor_parcel AS composicao_boleto,
    b.bole1_cor_dtvenc,
    b.bole1_cor_dtpgto,
    b.bole1_cor_valor,
    b.bole1_cor_vlconv,
    b.bole1_cor_vldesc,
    b.bole1_cor_vljfct,
    b.bole1_cor_vljuro,
    b.bole1_cor_vlmult,
    b.bole1_cor_valres,
    b.bole1_cor_linedi,
    b.bole1_cor_codbar
FROM dbo.ts1_core c
LEFT JOIN dbo.ts1_bole b ON b.bole1_core1_cod = c.core1_cod
WHERE c.vend1_cod = 1366
  AND TRY_CONVERT(int, LEFT(c.core1_doc_num, CHARINDEX('/', c.core1_doc_num + '/') - 1)) BETWEEN 18 AND 27
ORDER BY TRY_CONVERT(int, LEFT(c.core1_doc_num, CHARINDEX('/', c.core1_doc_num + '/') - 1)), b.bole1_cod DESC;

PRINT '=== BOLETOS RECENTES DOS DOIS CONTRATOS ===';
SELECT
    b.bole1_cod,
    b.bole1_core1_cod,
    b.bole1_vend1_cod,
    b.bole1_cli_cdclie,
    b.bole1_cli_nmclie,
    b.bole1_cor_cdobra,
    b.bole1_cor_nrapar AS unidade,
    b.bole1_cor_parcel AS composicao_boleto,
    b.bole1_cor_dtvenc,
    b.bole1_cor_dtpgto,
    b.bole1_cor_valor,
    b.bole1_cor_vldesc,
    b.bole1_cor_vljfct,
    b.bole1_cor_vljuro,
    b.bole1_cor_vlmult,
    b.bole1_cor_valres,
    b.bole1_cor_linedi,
    b.bole1_cor_codbar,
    b.bole1_dat_emi
FROM dbo.ts1_bole b
WHERE b.bole1_vend1_cod IN (1203, 1366)
ORDER BY b.bole1_cod DESC;
