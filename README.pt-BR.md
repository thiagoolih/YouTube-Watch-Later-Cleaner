# YouTube Watch Later Cleaner

[English](README.md)

Uma pequena extensão para navegadores (Microsoft Edge, Google Chrome e outros baseados em Chromium) que **esvazia a sua playlist "Ver mais tarde"** em poucos cliques e consegue **adicionar os vídeos de volta depois, a partir de um arquivo de backup**.

Tudo roda no seu navegador, usando a sessão em que você já está logado. Sem chave de API, sem projeto no Google Cloud e sem servidores externos.

> Procurando a versão que remove os seus *likes*? Veja o **[YouTube Likes Cleaner](https://github.com/thiagoolih/YouTube-Likes-Cleaner)**.

## Recursos

- **Limpar Ver mais tarde**: rola a playlist, coleta todos os vídeos e remove um a um.
- **Backup automático**: um arquivo `.json` com a lista completa é baixado *antes* de qualquer remoção.
- **Restaurar**: escolha um arquivo de backup e a extensão adiciona os vídeos de volta em Ver mais tarde.
- **Seguro por padrão**: remover tudo exige um segundo clique de confirmação, e você pode limitar a execução a N vídeos para testar antes.
- **Painel de progresso** com botão Parar, desaceleração automática quando o YouTube limita as requisições e um resumo no final.
- Interface em **português (BR) e inglês**.

## Instalação (sem pacote)

1. Baixe ou clone este repositório.
2. Abra `edge://extensions` (Edge) ou `chrome://extensions` (Chrome).
3. Ative o **Modo do desenvolvedor**.
4. Clique em **Carregar sem pacote** e selecione a pasta do projeto (a que contém o `manifest.json`).
5. Fixe a extensão na barra de ferramentas.

## Como usar

### Limpar Ver mais tarde

1. Clique no ícone da extensão e em **Limpar Ver mais tarde**. Se você não estiver na página "Ver mais tarde", ela abre essa página em uma nova aba; clique no botão de novo quando carregar.
2. Um painel aparece no canto inferior direito. Ele carrega a lista inteira e baixa o backup.
3. Digite quantos vídeos remover (teste com **5** primeiro) ou deixe vazio para todos e clique em **Remover**. Para todos os vídeos, clique de novo para confirmar.
4. Recarregue a página para conferir o resultado.

### Restaurar de um backup

1. Abra qualquer página do YouTube, clique no ícone da extensão e em **Restaurar de um backup**.
2. Escolha o arquivo `.json` criado antes, limite a quantidade se quiser e clique em **Restaurar**.

> Os vídeos adicionados de novo ganham uma nova "data de adição", e a posição deles depende de como o YouTube ordena a playlist. A extensão adiciona do fim do backup para o começo, supondo que itens novos entrem no topo, para recriar a ordem original. Se a ordem sair invertida, essa suposição não vale para a configuração de ordenação da sua conta.

### Formato do backup

```json
{
  "format": "youtube-watch-later-cleaner-backup",
  "version": 1,
  "exportedAt": "2026-10-09T12:00:00.000Z",
  "total": 2,
  "videos": [
    { "id": "dQw4w9WgXcQ", "title": "Primeiro vídeo da página" },
    { "id": "aaaaaaaaaaa", "title": "Segundo vídeo da página" }
  ]
}
```

Um array simples de objetos `{ "id", "title" }` também é aceito. Backups de outras ferramentas (como o de likes) são rejeitados de propósito.

## Como funciona

O popup injeta o `src/inject.js` na aba do YouTube (no contexto JavaScript da própria página, necessário para ler o `window.ytcfg`). O script chama o endpoint interno que o cliente web usa para editar playlists, `/youtubei/v1/browse/edit_playlist`, com as ações `ACTION_REMOVE_VIDEO_BY_VIDEO_ID` e `ACTION_ADD_VIDEO` na playlist `WL`, autenticado com o cabeçalho padrão `SAPISIDHASH`, calculado a partir do cookie da sua própria sessão.

A API oficial YouTube Data API não é uma opção aqui: ela não permite mais que aplicativos leiam ou modifiquem a playlist Ver mais tarde.

## Privacidade

- Nada é enviado para lugar nenhum além do `youtube.com`, direto do seu navegador.
- Sem analytics, sem telemetria, sem código remoto.
- As únicas permissões são `scripting` e acesso a `https://www.youtube.com/*`.
- Os backups são salvos apenas na pasta de downloads do seu computador.

## Limitações e aviso

- Este projeto é **não oficial** e não tem afiliação com o YouTube ou o Google.
- Ele depende de **endpoints internos e não documentados** que o YouTube pode mudar a qualquer momento, o que pode quebrar a extensão.
- Automatizar ações na sua conta pode contrariar os Termos de Serviço do YouTube. **Use por sua conta e risco** e mantenha as requisições lentas (o padrão já é).
- Remover vídeos só é reversível pela função Restaurar ou adicionando-os de novo manualmente. Guarde o arquivo de backup.
- **O contador de vídeos da playlist pode demorar a atualizar.** Depois da limpeza, o cabeçalho da página pode continuar mostrando o número antigo mesmo com a lista vazia. Isso é cache do YouTube e costuma se corrigir sozinho em algumas horas. Para conferir, recarregue com `Ctrl+Shift+R` ou olhe de novo mais tarde.
- **Vídeos indisponíveis não são afetados.** Vídeos excluídos ou privados ficam ocultos na lista e a extensão não consegue removê-los. Eles podem continuar sendo contados no total da playlist, e não podem ser restaurados.
- **Listas muito grandes podem precisar de mais de uma execução.** Se sobrar algo depois da limpeza, rode a extensão de novo.

## Solução de problemas

| Sintoma | O que fazer |
| --- | --- |
| "Nenhum vídeo encontrado" | Confira se está logado na conta certa e em `youtube.com/playlist?list=WL`. |
| Falhas com status `400` ou `-3` | A API interna pode ter mudado. Abra uma issue com a saída do console (`F12`). |
| Status `401` / `403` | Sua sessão não é válida. Recarregue o YouTube e faça login de novo. |
| Status `429` | O YouTube está limitando as requisições. A extensão espera 60 s e tenta de novo sozinha. |
| Nada acontece ao clicar | Recarregue a aba do YouTube e tente de novo. |
| Várias contas Google | A extensão age na conta ativa na aba. Confira antes de confirmar. |

## Desenvolvimento

```bash
npm install
npm test        # testes de fumaça (jsdom) dos fluxos de limpar e restaurar
```

Estrutura do projeto:

```
manifest.json          Manifest V3
src/popup.*            Popup da barra de ferramentas
src/inject.js          Script da página: coleta, backup, limpar, restaurar
_locales/              Traduções do popup e do manifest
icons/                 Ícones da extensão
tests/smoke.test.js    Testes com página simulada
```

O painel exibido na página do YouTube tem um dicionário próprio no topo do `src/inject.js`. Para adicionar um idioma, inclua uma entrada ali e uma nova pasta em `_locales/`.

## Contribuindo

Issues e pull requests são bem-vindos, principalmente relatos de mudanças do YouTube que quebrem a extensão.

## Licença

[MIT](LICENSE)
