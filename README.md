# Para a Karol ❤️

App pessoal do Amiro pra Karol: mensagens de amor, orgulho e carinho **5x por dia** (3 horários fixos + 2 surpresa).

- **Backend:** Node.js + Express + node-cron + OneSignal (Render)
- **Frontend:** PWA com fotos de vocês (GitHub Pages)
- **Push:** OneSignal (funciona no Android e no iPhone com os cuidados abaixo)

## Como a mensagem chega

1. O backend escolhe uma frase e envia via OneSignal com `external_user_id = karol_amor`.
2. A Karol abre o app, toca em **Ativar notificações** → o app faz login com o mesmo ID e pede permissão.
3. A notificação aparece na barra / tela de bloqueio.
4. A mesma mensagem (ou a última enviada) também aparece no card do app.

O `USER_ID` do backend e o `USER_EXTERNAL_ID` do frontend **precisam ser iguais**.

## Android vs iPhone

| | Android (Chrome) | iPhone (Safari) |
|--|------------------|-----------------|
| Ativar | Abrir o site → Ativar notificações → Permitir | **Adicionar à Tela de Início** primeiro, abrir pelo ícone, depois permitir notificações |
| Background | Funciona bem com o app fechado | Funciona melhor como PWA instalado (ícone na home) |
| Dica | Não desative notificações do Chrome | iOS 16.4+ com PWA instalado |

No app, se a Karol negar a permissão no iPhone, aparece um texto explicando o passo a passo.

## Deploy rápido

### Backend (Render)
1. Suba a pasta `backend/`
2. Build: `npm install` · Start: `npm start`
3. Env:
   - `ONESIGNAL_API_KEY` (obrigatória)
   - `USER_ID=karol_amor`
   - `TZ=America/Bahia`
   - `ALLOWED_ORIGIN` = URL do Pages
   - `RENDER_EXTERNAL_URL` (auto no Render)

### Frontend (GitHub Pages)
1. Suba a pasta `frontend/` (com a pasta `assets/`)
2. Confirme `BACKEND_URL` em `script.js`

### OneSignal
- App ID no frontend e (opcional) no env do backend
- REST API Key **só** no backend

## Testar push

Com o backend acordado e a API key ok:

```
GET https://meu-amor-app.onrender.com/test-send
```

A Karol precisa ter ativado as notificações antes.  
Outros: `/ping` · `/schedule` · `/ultima-mensagem` · `/mensagens`

## Horários
- Fixos: 08:00, 13:00, 18:00 (`America/Bahia`)
- 2 aleatórios por dia (regenerados à meia-noite, longe dos fixos)

## O que tem de especial nesta versão
- Ícone do app = foto de vocês
- Galeria com 3 fotos no card
- Fundo sutil com a foto juntos
- Mensagens em português natural (sem cara de template)
- Sem Lottie externo / menos “cara de IA”
- PWA com ícones locais 192/512 + apple-touch-icon
- Orientação iPhone + Android no fluxo de permissão

Feito com muito amor.
