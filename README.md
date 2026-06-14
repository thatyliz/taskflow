# ⬡ TaskFlow

Um sistema CRUD de tarefas em Node.js + Postgres usado como laboratório prático para aplicar progressivamente **práticas de SRE e DevOps**. Desde containerização até orquestração com Kubernetes, CI/CD e observabilidade completa.

A aplicação foi gerada com auxílio de _IA (Claude/Anthropic)_ e escolhida intencionalmente como ponto de partida: o foco deste repositório **não é o código da aplicação em si**, mas a **infraestrutura construída em torno dela** — containers, pipelines, métricas e resiliência. Parte da minha transição de **10 anos em Monitoramento & Observabilidade** para a função de Site Reliability Engineer (SRE).

---

## 🗺️ Roadmap de Evolução

Cada fase constrói sobre a anterior, refletindo progressão real de conhecimento.

| Fase | Foco | Status |
|------|------|--------|
| **0 — Aplicação Base** | CRUD Node.js + PostgreSQL com logs estruturados e métricas Prometheus + health checks. Baseline gerado por IA e não executado localmente, simulando onboarding de código legado/terceirizado. | ✅ Concluído |
| **1 — Docker (Manual)** | Build da imagem Alpine, publicação no Docker Hub, criação de redes e volumes via CLI | 🔜 Próximo |
| **2 — Docker Compose** | Orquestração multi-container, redes, volumes e variáveis de ambiente como código | 🔜 Próximo |
| **3 — Kubernetes** | Deployments, Services, ConfigMaps, HPA, liveness e readiness probes | 🔜 Planejado |
| **4 — GitHub Actions** | Pipeline CI/CD — build, push de imagem e deploy automatizado | 🔜 Planejado |
| **5 — Observabilidade (Prometheus + Grafana)** | Dashboards, alertas e métricas | 🔜 Planejado |
| **6 — Observabilidade (Grafana Loki)** | Ingestão e consulta de logs estruturados gerados pela aplicação | 🔜 Planejado |
| **7 — Tracing com Jaeger / OpenTelemetry** | Traces distribuídos correlacionados com os logs via traceId (já instrumentado) | 🔜 Planejado |
| **8 — Terraform** | Provisionamento de infraestrutura como código (IaC) | 🔜 Planejado |
| **9 — DevOps na AWS / Azure** | Deploy em cloud pública com serviços gerenciados | 🔜 Planejado |
| **10 — GitOps com ArgoCD** | Deploy declarativo e reconciliação contínua no Kubernetes | 🔜 Planejado |

---

## 📚 Documentação por Fase

| Fase | Documentação |
|------|--------------|
| Fase 1 — Docker Manual | [aprendizados-fase-01.md](aprendizados-fase-01.md) |

---

## 🐳 Imagem Docker

A imagem desta fase está publicada no Docker Hub. A tag `latest` sempre aponta para a versão mais recente.

```bash

docker pull thatianaliz/taskflow:latest

```

Para uma versão específica de cada fase:

```bash

docker pull thatianaliz/taskflow:01-dockerfile-manual

```

🔗 [hub.docker.com/r/thatianaliz/taskflow](https://hub.docker.com/repository/docker/thatianaliz/taskflow)

---

## ⚠️ Known Issues

| Fase | Problema | Impacto | Previsão |
|------|----------|---------|----------|
| Fase 1 | Modal do frontend de "Nova Tarefa" já inicia aberto na pagina e não fecha após salvar ou cancelar | Visual — a API REST funciona corretamente | Fase 2 |

---

## 📋 Sobre a Aplicação

O **TaskFlow** é um sistema web de gerenciamento de tarefas desenvolvido com auxílio de IA. Foi escolhido como base do laboratório por já nascer com as características que uma aplicação precisa ter para ser bem operada em produção:

### O que a aplicação entrega

- CRUD completo de tarefas (criar, listar, editar, deletar) com interface web
- Arquitetura em camadas: Controller → Service → Repository
- PostgreSQL com pool de conexões e migrations versionadas

### Por que ela é um bom subject de laboratório SRE

| Recurso | Para que serve na prática |
|---------|--------------------------|
| `GET /health` | Liveness probe — Kubernetes reinicia o pod se falhar |
| `GET /ready` | Readiness probe — retira o pod do balanceador durante startup |
| `GET /metrics` | Scrape pelo Prometheus — métricas HTTP, banco e negócio |
| `GET /info` | Versão, ambiente, uptime — útil em dashboards e deploys |
| Logs JSON estruturados | Ingestão direta no Loki sem parser adicional |
| `traceId` em todos os logs | Correlação com traces via Jaeger e OpenTelemetry |
| Chaos middleware | Simula latência, erro de banco, crash e timeout via env var |

### Simulação de Falhas (Chaos Engineering)

Configure no `.env` e reinicie para injetar falhas controladas:

```bash
FAILURE_MODE=latency    # Injeta 500ms–3500ms de latência aleatória
FAILURE_MODE=db_error   # Simula erro de conexão com o banco (HTTP 503)
FAILURE_MODE=panic      # Simula crash da aplicação (process.exit)
FAILURE_MODE=timeout    # Deixa requests sem resposta
FAILURE_RATE=0.3        # Percentual de requests afetadas (0.0 – 1.0)
```

> Os endpoints `/health`, `/ready` e `/metrics` **nunca** são afetados pelo chaos middleware.

Ou execute o script standalone, sem precisar reconfigurar a aplicação:

```bash
npm run simulate:failures
```

---

## 📁 Estrutura do Projeto

```
taskflow/
├── src/
│   ├── server.js               # Entrypoint — Express, middlewares, graceful shutdown
│   ├── config/
│   │   ├── database.js         # Pool de conexões pg + rastreio de métricas
│   │   └── migrate.js          # Runner de migrations versionadas
│   ├── routes/
│   │   └── index.js            # Rotas de tarefas + endpoints de monitoramento
│   ├── controllers/
│   │   └── taskController.js   # Camada HTTP (req → service → res)
│   ├── services/
│   │   └── taskService.js      # Regras de negócio + métricas de KPI
│   ├── repositories/
│   │   └── taskRepository.js   # Queries SQL — única camada que fala com o banco
│   ├── middleware/
│   │   └── index.js            # traceId, request logger, chaos, error handler
│   └── utils/
│       ├── logger.js           # Winston — JSON em prod, colorido em dev
│       └── metrics.js          # Registry Prometheus com todas as métricas
├── public/                     # Frontend SPA (HTML + CSS + JS vanilla)
├── scripts/
│   └── simulate-failures.js    # Script standalone de simulação de falhas
├── .env.example
├── .gitignore
└── README.md
```

---

## ⚙️ Variáveis de Ambiente

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `PORT` | Porta da aplicação | `3000` |
| `NODE_ENV` | Ambiente (`production` ativa logs JSON) | `development` |
| `APP_VERSION` | Versão exibida nos logs e em `/info` | `1.0.0` |
| `LOG_LEVEL` | Nível de log (`debug`, `info`, `warn`, `error`) | `info` |
| `DB_HOST` | Host do PostgreSQL | `localhost` |
| `DB_PORT` | Porta do PostgreSQL | `5432` |
| `DB_NAME` | Nome do banco | `taskflow` |
| `DB_USER` | Usuário do banco | `taskuser` |
| `DB_PASSWORD` | Senha do banco | `taskpass` |
| `DB_POOL_MIN` | Mínimo de conexões no pool | `2` |
| `DB_POOL_MAX` | Máximo de conexões no pool | `10` |
| `FAILURE_MODE` | Modo de falha para chaos engineering | — |
| `FAILURE_RATE` | Taxa de falhas (0.0–1.0) — requer `FAILURE_MODE` | `0.5` |

---

## 📊 Métricas Prometheus

A aplicação expõe métricas em `/metrics` prontas para scrape. Separadas em três grupos:

**Infraestrutura HTTP**
- `taskflow_http_request_duration_seconds` — latência das requisições (Histogram)
- `taskflow_http_requests_total` — total de requisições (Counter)
- `taskflow_http_errors_total` — total de erros 4xx/5xx (Counter)

**Banco de Dados**
- `taskflow_db_query_duration_seconds` — duração das queries (Histogram)
- `taskflow_db_errors_total` — erros no banco (Counter)
- `taskflow_db_pool_size` — estado do pool de conexões (Gauge)

**Negócio (KPIs)**
- `taskflow_tasks_created_total` — tarefas criadas por prioridade (Counter)
- `taskflow_tasks_completed_total` — tarefas concluídas por prioridade (Counter)
- `taskflow_active_tasks` — tarefas pendentes/em andamento (Gauge)
- `taskflow_simulated_failures_total` — falhas injetadas pelo chaos (Counter)

---

## 👩‍💻 Sobre este Laboratório

Tenho 10 anos de experiência em Monitoramento e Observabilidade, atuando com plataformas como Splunk, Zabbix e AppDynamics. Este laboratório foi criado para consolidar conhecimentos em DevOps, SRE e Cloud Native por meio da implementação prática e progressiva de tecnologias amplamente utilizadas em ambientes modernos de produção.

O objetivo é evoluir de uma aplicação observável para uma arquitetura automatizada, escalável e resiliente, aplicando conceitos de containerização, CI/CD, Kubernetes, observabilidade, infraestrutura como código (IaC), automação e boas práticas de engenharia de confiabilidade.

Ao longo das etapas, são explorados temas como Docker, GitHub Actions, Kubernetes, Prometheus, Grafana, Loki, OpenTelemetry, Terraform, GitOps e ArgoCD, simulando desafios encontrados em ambientes corporativos reais.

**Objetivo profissional**: Atuar como Site Reliability Engineer (SRE), unindo experiência em observabilidade, monitoramento de aplicações, automação, plataformas cloud-native e operações orientadas à confiabilidade.

---

## 🤖 Sobre a Aplicação

O código do TaskFlow foi gerado com auxílio de IA (Claude/Anthropic). 
Toda a infraestrutura, configuração de ambiente e práticas SRE aplicadas sobre ela são de minha autoria.

