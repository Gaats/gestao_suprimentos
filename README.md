# Correção de autenticação e logout

Este pacote contém os arquivos de autenticação corrigidos para integrar ao projeto existente sem alterar o layout.

## Substitua na raiz do GitHub
- auth.js
- login.html
- supabase-config.js
- vercel.json

## Ajuste os arquivos existentes
- Aplique `index-auth-snippet.html` ao `index.html`.
- Acrescente `styles-auth-snippet.css` ao final de `styles.css`.
- Mantenha o `app.js` existente.

## Configuração
Preencha `supabase-config.js` com a Project URL e a chave pública anon/publishable. Nunca use service_role.

## Teste
1. Abra index.html em janela anônima: deve redirecionar ao login.
2. Entre: deve abrir index.html.
3. Selecione Sair: deve encerrar a sessão local e voltar ao login.
