# LarmHub Frontend 0.8.1

Correção pontual do erro de compilação da versão 0.8.0:

`Property 'indice_relatorio' does not exist on type 'StratoReportRow'.`

Foi adicionada ao tipo `StratoReportRow` a propriedade opcional que já é retornada pela análise do Strato:

```ts
indice_relatorio?: number | null
```

A lógica de vínculo multiparcelas da versão 0.8.0 foi preservada sem outras alterações.

Extraia sobre o frontend 0.8.0 e publique novamente na Vercel. Não precisa atualizar o backend.
