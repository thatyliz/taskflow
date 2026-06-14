# Comandos executados — Fase 1

## Build da imagem
```bash
sudo docker build -t thatianaliz/taskflow:01-dockerfile-manual -f taskflow/docker/Dockerfile .
```

## Criação da tag adicional de latest para a imagem
```bash
sudo docker tag thatianaliz/taskflow:01-dockerfile-manual thatianaliz/taskflow:latest
```

## Construção do container
### Criação da rede docker do tipo bridge
```bash
sudo docker network create --subnet=10.0.0.0/16 --gateway=10.0.0.1 taskflow-network
```
#### Por que criar uma rede customizada?
Por padrão, containers Docker rodam em redes separadas e não conseguem se comunicar entre si. O TaskFlow precisa que a aplicação Node.js fale com o PostgreSQL.
### Validação
```bash
sudo docker network ls
```

## Criação de um volume
O volume é um espaço de armazenamento que existe **fora do container**, e é gerenciado pelo Docker. Os dados persistem mesmo que o container seja destruído e recriado.
```bash
sudo docker volume create  postgres-data
```

## Criação do container
Utilizado o mapeamento de portas do Docker com o parâmetro -p <port_host>:<port_host> ele foi utilizado para permitir conexões locais através de localhost:<port_host>.  Sem esse mapeamento, o banco e aplicação estariam acessíveis apenas dentro da rede interna do Docker.
### Banco de dados portgres (vinculando a rede e ao volume)
```bash
sudo docker container run -d -p 5432:5432 --name taskflow-db -e POSTGRES_PASSWORD=Pg#123 -e POSTGRES_USER=taskflowuser -e POSTGRES_DB=taskflow --network taskflow-network --mount type=volume,source=postgres-data,target=/var/lib/postgresql/data postgres:12.17
```
### Aplicação
```bash
sudo docker container run -d -p 3000:3000 --name taskflow-app -e DB_NAME=taskflow -e DB_USER=taskflowuser -e DB_PASSWORD=Pg#123 -e DB_HOST=taskflow-db --network taskflow-network thatianaliz/taskflow:01-dockerfile-manual
```
### Validação
#### Validar se os containers estão em execução
```bash
sudo docker container ls
```
#### Validar se container do banco está usando um volume
```bash
sudo docker ps -a --filter volume=postgres-data
```
#### Validar a persistência de dados após remover o container
```bash
# Parar o container
sudo docker container stop taskflow-db

# Remover o container
sudo docker container rm taskflow-db

# Recriar o container com o mesmo volume
sudo docker container run -d -p 5432:5432 --name taskflow-db -e POSTGRES_PASSWORD=Pg#123 -e POSTGRES_USER=taskflowuser -e POSTGRES_DB=taskflow --network taskflow-network --mount type=volume,source=postgres-data,target=/var/lib/postgresql/data postgres:12.17
```
Os dados seguiram persistindo no banco após a recriação do container, concluindo a validação do volume pois segue funcionando corretamente.

#### Verificar se os containeres estão alocados na network correta
```bash
sudo docker network inspect taskflow-network
```



## Publicação no Docker Hub
Imagem validada e sem bugs de infraestrutura. Push para o Docker Hub:
- Tag latest sempre aponta para a versão mais recente
```bash
sudo docker push thatianaliz/taskflow:latest
```
-Tag da fase 1
```bash
sudo docker push thatianaliz/taskflow:01-dockerfile-manual
```





# Problemas encontrados
## Problema 1 - Aplicação não gravava dados no banco — erro de autenticação

**Sintoma**
Interface retornava "Erro interno do servidor" ao tentar salvar tarefas.

**Diagnóstico**
Acessei os logs do container para identificar a falha:
```bash
sudo docker logs -f taskflow-app
```

**Logs identificados**
```
11:05:17 error: Erro ao executar query {
  "operation":"count",
  "table":"tasks",
  "error":"password authentication failed for user \"taskuser\"",
  "sql":"SELECT COUNT(*) AS total FROM tasks"
}

11:05:17 error [trace:40006d4f-6291-4992-b7f6-59bb844d67d8]: Erro não tratado {
  "error":"password authentication failed for user \"taskuser\"",
  "stack":"error: password authentication failed for user \"taskuser\"\n
    at /app/node_modules/pg-pool/index.js:45:11\n
    at async query (/app/src/config/database.js:49:20)\n
    at async Object.findAll (/app/src/repositories/taskRepository.js:40:18)\n
    at async Object.listTasks (/app/src/services/taskService.js:44:25)"
}
```

O erro: _error: password authentication failed for user "taskuser"_

**Análise**
- Dois logs do mesmo tipo — confirmou que era um único problema
- Erro de autenticação no PostgreSQL
- Testei o acesso local ao banco (usando DBeaver) com as credenciais criadas e funcionou
- Reli o log com calma e percebi que a aplicação esperava variáveis de ambiente específicas
- As credenciais passadas no `docker run` por um erro de digitação estavam diferentes das esperadas pela aplicação

**Causa raiz**
Variáveis de ambiente passadas incorretamente na criação do container.

**Solução**
Recriei o container com as variáveis corretas.

**Lição aprendida**
Falhas de configuração são uma das causas mais comuns de incidentes em ambientes distribuídos. Variáveis de ambiente incorretas podem causar erros de conexão mesmo quando todos os serviços estão funcionando corretamente.
A análise dos logs e a validação isolada dos componentes permitiram identificar rapidamente a causa raiz. Esse incidente reforçou a importância da observabilidade, da documentação das configurações e da validação sistemática dos parâmetros utilizados durante o deploy.

----
## Problema 2 - Tabela `tasks` não encontrada — migration não executada

**Sintoma**
Erro ao tentar criar uma tarefa na interface.

**Logs identificados**
```
11:23:46 error: Erro ao executar query {"service":"taskflow","version":"1.0.0","operation":"insert","table":"tasks","error":"relation \"tasks\" does not exist","sql":"INSERT INTO tasks (title, description, priority, due_date)\n     VALUES ($1, $2, $3, $4)\n     RETURNING *"}
11:23:46 error [trace:95b943b6-d51a-47fb-978c-f212fbc4a0c8]: Erro não tratado {"service":"taskflow","version":"1.0.0","error":"relation \"tasks\" does not exist","stack":"error: relation \"tasks\" does not exist\n    at /app/node_modules/pg-pool/index.js:45:11\n    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)\n    at async query (/app/src/config/database.js:49:20)\n    at async Object.create (/app/src/repositories/taskRepository.js:81:18)\n    at async Object.createTask (/app/src/services/taskService.js:67:16)\n    at async createTask (/app/src/controllers/taskController.js:35:16)"}
```

O erro: _Ao executar um insert na tabela tasks. ela não foi encontrada_

**Diagnóstico**
Busquei no projeto onde a tabela era criada:
```bash
grep -R "tasks (" .
```
Encontrei o script `src/config/migrate.js` responsável por criar as tabelas.

**Causa raiz**
O script de migration não estava sendo executado antes da aplicação subir.

**Solução**
Alterei o `CMD` no Dockerfile para executar a migration antes do servidor:
```dockerfile
CMD ["sh", "-c", "node src/config/migrate.js && node src/server.js"]
```
Imagem recriada, e ao testar a execução do container o mesmo erro continuou ocorrendo e com um outro log junto. 


**Lição aprendida**

Nem sempre uma aplicação containerizada executa automaticamente scripts de inicialização ou migrations. É importante validar o ciclo completo de startup da aplicação e garantir que dependências do banco sejam criadas antes da inicialização do serviço.

----
## Problema 3 - Função `gen_random_uuid()` não existe — extensão pgcrypto ausente

**Sintoma**
A aplicação não subiu (interface inacessível) 

**Logs identificados**
```
12:19:38 error: Erro ao executar query {"service":"taskflow","version":"1.0.0","operation":"migrate","table":"schema_migrations","error":"function gen_random_uuid() does not exist","sql":"\n      CREATE TABLE IF NOT EXISTS tasks (\n        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n        title       VARCHAR(255)  NOT NULL,\n        description TEXT,\n        status      VARCHAR(20)   NOT NULL DEFAULT 'pending'\n                      CHECK (status IN ('pending', 'in_progress', 'done')),\n        priority    VARCHAR(10)   NOT NULL DEFAULT 'medium'\n                      CHECK (priority IN ('low', 'medium', 'high')),\n        due_date    TIMESTAMPTZ,\n        created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),\n        updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()\n      );\n\n      CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks (status);\n      CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks (priority);\n      CREATE INDEX IF NOT EXISTS idx_tasks_created  ON tasks (created_at DESC);\n\n      CREATE OR REPLACE FUNCTION update_updated_at()\n      RETURNS TRIGGER AS $$\n      BEGIN\n        NEW.updated_at = NOW();\n        RETURN NEW;\n      END;\n      $$ LANGUAGE plpgsql;\n\n      DROP TRIGGER IF EXISTS trg_tasks_updated_at ON tasks;\n      CREATE TRIGGER trg_tasks_updated_at\n        BEFORE UPDATE ON tasks\n        FOR EACH ROW EXECUTE FUNCTION update_updated_at();\n    "}
12:19:38 error: Falha nas migrations {"service":"taskflow","version":"1.0.0","error":"function gen_random_uuid() does not exist"}
```

error: Migration falhou ao tentar criar a tabela `tasks`. Erro na função gen_random_uuid(). 

**Diagnóstico**
Pesquisei sobre a função e identifiquei que `gen_random_uuid()` pertence
à extensão `pgcrypto` do PostgreSQL, ela não está disponível por padrão em todas
as instalações.

**Causa raiz**
A extensão `pgcrypto` não estava sendo habilitada no script de migration.

**Solução**
Adicionei no início do `migrate.js`:
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

**Lição aprendida**
Nem todas as dependências de uma aplicação estão explícitas no código-fonte ou nas variáveis de ambiente. Algumas dependências estão relacionadas ao próprio banco de dados. Ao automatizar a criação da infraestrutura através de containers, é importante garantir que todas as dependências necessárias sejam provisionadas automaticamente. Se não, a aplicação pode funcionar em um ambiente e falhar em outro devido a diferenças de configuração.


## Modal não fechava ao salvar ou cancelar — v2

**Sintoma**
Modal de "Nova Tarefa" abria automaticamente e não fechava ao salvar ou cancelar.

**Causa raiz**
Conflito entre atributo HTML `hidden` e regras CSS com `display:flex` —
o CSS tinha especificidade maior e sobrescrevia o `display:none` do `hidden`.

**Solução**
Como os arquivos `public/index.html` e `public/js/app.js` foram gerados
por IA (Claude/Anthropic), a correção foi solicitada à mesma ferramenta.
Os arquivos corrigidos foram substituídos e a imagem reconstruída.

A correção substituiu o controle via atributo `hidden` por `style.display`
direto no JS, que tem especificidade máxima e não sofre conflito com CSS externo.

**Imagem corrigida**
`thatianaliz/taskflow:01-dockerfile-manual-v2`

**Lição aprendida**
Durante a correção, o container continuava exibindo o comportamento antigo
mesmo após substituir os arquivos. A causa foi o cache do Docker, onde a imagem
antiga estava sendo reutilizada nos builds seguintes.

A solução foi forçar o rebuild sem cache:
```bash
sudo docker build --no-cache -t thatianaliz/taskflow:01-dockerfile-manual-v2 \
  -f taskflow/docker/Dockerfile .
```

O `--no-cache` garante que todos os layers sejam reexecutados do zero,
assegurando que os arquivos alterados sejam de fato copiados para a nova imagem.


## Resumo de Aprendizados — Fase 1
- **Dockerfile** — construção de imagens com boas práticas: Alpine, usuário não-root e cache de layers
- **Docker Hub** — versionamento de imagens com tags por fase (`01-dockerfile-manual`, `latest`)
- **Redes customizadas** — containers se comunicam pelo nome, não pelo IP
- **Volumes** — dados persistem mesmo após remover e recriar o container
- **Variáveis de ambiente** — configuração via `-e` no `docker run`
- **Migrations** — devem ser executadas antes do start da aplicação via `CMD`
- **Troubleshooting com logs** — `docker logs -f` como primeira ferramenta de diagnóstico
- **pgcrypto** — extensão do PostgreSQL necessária para `gen_random_uuid()` em versões anteriores ao 14
- **Cache do Docker** — `--no-cache` necessário para garantir que alterações nos arquivos sejam copiadas



