# Estoque da Planta - publicação

1. Preencha `supabase-config.js` com a Project URL e a chave pública `anon` ou `publishable`.
2. Envie todos os arquivos deste pacote para a raiz do repositório GitHub.
3. Na Vercel, publique como projeto estático, sem comando de build.
4. No Supabase, em Authentication > URL Configuration, configure a Site URL com o domínio de produção da Vercel.
5. Teste em janela anônima: abrir `index.html` deve redirecionar para `login.html`; autenticar deve retornar a `index.html`; Sair deve retornar ao login.

Nunca use a chave `service_role` no navegador.
