# AGEstor — o gestor da sua empresa de serviços

App (PWA) para empresas de elétrica, pintura, hidráulica, refrigeração e manutenção:
**clientes, orçamentos (PDF e WhatsApp), catálogo de serviços e materiais, equipe** e
**personalização de cada empresa sem mexer no código**.

- `index.html` — site de apresentação com os planos.
- `app.html` — o app (login, empresa, telas do dia a dia).
- `supabase/schema.sql` — banco de dados e regras de segurança.

## Como colocar no ar (uma vez)
1. **Supabase**: crie o projeto (região São Paulo). Hoje a conta gratuita já tem 2 projetos ativos;
   quando for lançar, escolha entre assinar o Supabase Pro ou usar um projeto existente.
2. No projeto: **SQL Editor → +** → cole `supabase/schema.sql` inteiro → **Run**.
   Pode rodar de novo a cada atualização: nada é apagado.
3. Para ver o **Painel do dono**, rode uma vez com o seu e-mail de login:
   `insert into public.admins (email) values ('seu-email@exemplo.com') on conflict do nothing;`
4. **Authentication → URL Configuration**: em *Site URL* coloque o endereço do app
   (ex.: `https://agemanutencaoeletrica-png.github.io/agestor/app.html`).
5. Em `config.js` preencha `SUPABASE_URL` e `SUPABASE_ANON_KEY` (a chave **anon/publishable**, que é pública).
   **Nunca** coloque a chave `service_role` aqui.
6. **GitHub Pages**: Settings → Pages → *Deploy from a branch* → `main` / raiz.

## Como funciona a separação entre empresas
- Cada pessoa pertence a **uma** empresa. Todas as tabelas têm regras (RLS): ninguém vê nem grava
  dados de outra empresa, nem forçando pelo navegador.
- **Papéis**: *Dono* (tudo) · *Administrador* (tudo, menos mexer no dono e em outros administradores) ·
  *Equipe* (usa clientes, orçamentos e catálogo; não apaga, não convida, não muda a empresa).
- **Convite**: Equipe → Convidar → código de 8 letras (vale 7 dias, uso único) ou link pelo WhatsApp.
  Ao desligar alguém, a pessoa perde o acesso na hora e o que ela fez continua guardado.
- **Teste e assinatura**: empresa nova tem 14 dias. Vencida, continua vendo tudo, mas não grava.
  Quem libera é o dono do AGEstor no **Painel do dono** (+30 dias, +1 ano, teste, bloquear).
  A cobrança automática (Mercado Pago) entra numa próxima etapa.

## O que cada empresa personaliza (em Empresa)
Tudo fica salvo em `empresas.config` (JSON), sem mudar o código:
- **Dados e marca**: nome, CNPJ, contatos, endereço, logo (reduzida automaticamente) e duas cores.
- **Áreas ligadas**: Clientes, Orçamentos, Catálogo, Equipe.
- **Nomes na tela**: ex.: “Orçamento” → “Proposta”, “Cliente” → “Condomínio”.
- **Orçamento**: validade padrão, garantia, forma de pagamento, texto final e
  esconder o preço unitário dos materiais no documento.
- **Ramo**: ao criar a empresa já vem uma tabela inicial de serviços e materiais do ramo
  (`ramos.js`); os preços são exemplos e cada empresa ajusta os seus.

## Orçamentos
- Salva sozinho enquanto digita (e ao fechar ou sair do app).
- Número sequencial próprio de cada empresa e total calculado pelo banco.
- Ao escolher um item do catálogo, preço e unidade entram sozinhos.
- **Ver / PDF**: documento com a marca da empresa → *Imprimir / Salvar PDF*.
- **WhatsApp**: manda o resumo para o telefone do cliente e marca como *Enviado*.
- **Duplicar** para fazer um parecido.

## 🛠️ Ordens de serviço e app do funcionário
- **Gestor** (aba Ordens de serviço): cria a ordem (ou **Gerar OS** a partir de um orçamento), escolhe
  data e quem vai fazer, acompanha chegada/fotos/saída e o relatório, gera o **Relatório / PDF** com
  fotos e assinatura e manda para o cliente pelo **WhatsApp**. Pode reabrir uma ordem concluída.
- **Funcionário** (aba **Meu dia**, abre direto nela): vê só as ordens dele, com **Como chegar**,
  **Ligar** e WhatsApp do cliente; registra **📍 Cheguei / 📷 Foto / 🏁 Saí** (hora do servidor + GPS do
  celular; sem GPS registra marcado “sem GPS”), escreve o **relatório** com os materiais usados e pega
  a **assinatura do cliente com o dedo**. Também abre um serviço que não estava na lista.
- Fotos e assinaturas ficam no **Storage** do Supabase (bucket privado `fotos`, criado pelo
  `schema.sql`), na pasta da empresa; só a própria empresa abre, por link temporário.
- A área pode ser desligada em Empresa → Áreas que a empresa usa.

## 💰 Pagamentos da equipe (só dono e administrador)
- **Pessoas**: funcionários com login e diaristas sem app. Com a **chave Pix** o app reconhece o
  comprovante; com a **diária** calcula o fechamento pelos dias com chegada no “Meu dia”.
- **Ler comprovantes**: foto (leitura por OCR, no próprio celular/computador), PDF, texto colado ou
  **Ctrl+V**. O app tira valor, data, hora, quem recebeu e o ID do Pix, acha a pessoa (chave Pix, CPF,
  telefone ou nome) e avisa se o comprovante **já foi lançado**. Também lança **pagamento em dinheiro**.
- **Fechamento** por semana, quinzena ou mês: dias × diária, pago, adiantamentos/vales, reembolsos e
  **saldo** de cada pessoa → PDF e WhatsApp para a pessoa. Planilha CSV e resumo no WhatsApp.
- Quem tem login vê **os próprios pagamentos** e comprovantes em 👤 Minha conta. Comprovantes ficam no
  Storage em `<empresa>/pagamentos/` e ninguém da equipe abre o de outra pessoa.

## 🧾 Compras e despesas (só dono e administrador)
- **Ler nota**: o **XML** que a loja manda por e-mail (exato), **PDF** (inclusive orçamento de loja gerado
  pelo sistema dela, lido pela posição das colunas) ou **foto** do cupom/DANFE (OCR, com uma 2ª leitura
  quando a soma dos itens não fecha). Também **colar lista**, lançar à mão e **despesas** (combustível,
  veículo, alimentação, pedágio, ferramentas).
- O app confere a **soma dos itens × total**, reconhece a **nota já lançada** (chave de acesso, número da
  nota da mesma loja, ou mesma loja + valor + data) e não lança de novo.
- **Falta pagar**: boleto e **fiado** (vence dia 5 do mês seguinte) ficam no alerta até tocar em “Paguei”.
- Liga a compra a uma **ordem de serviço** (a OS mostra quanto de material foi comprado para ela).
- O último preço pago vira **custo** do item (tabela `custos`, que a equipe não vê); o catálogo mostra o
  custo e a margem. Material novo da nota entra no catálogo com preço de venda igual ao custo.
- Totais por loja e por destino, planilha CSV.

## Próximas etapas (ver PLANOS.md no repositório da AGE)
Cobrança automática, laudo técnico, e depois Play Store.
