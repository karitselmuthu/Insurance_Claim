# Insurance Damage Claim Review System

A multi-agent system that verifies insurance damage claims using multimodal AI. The system analyzes images, claim conversations, and user history to decide whether claims are **supported**, **contradicted**, or **require more information**.

## Features

- **Multi-Stage Pipeline**: Triage → Vision Analysis → Final Judgment
- **Multimodal Analysis**: Processes images with Claude 3.5 Sonnet
- **Cost-Efficient**: Uses Claude 3 Haiku for fast triage processing
- **Prompt Caching**: Ephemeral cache control for repeated system prompts
- **Rate Limiting**: Built-in concurrency control and exponential backoff retry logic
- **Image Optimization**: Automatic downscaling (≤1568px) and JPEG compression
- **Evidence Validation**: Checks minimum evidence requirements by claim type
- **Risk Assessment**: Identifies quality issues and user history risks
- **REST API**: Express server for real-time single-claim review

## Architecture

### Pipeline Stages

1. **Triage (Haiku)**: Extracts claim intent from user conversation
2. **Vision (Sonnet)**: Analyzes images for damage observations
3. **Validation**: Checks evidence against requirements
4. **Risk Aggregation**: Identifies quality and history risks
5. **Judge (Sonnet)**: Makes final claim decision with reasoning

### Data Flow

```
claims.csv → [Triage] → [Vision] → [Validation] → [Risk] → [Judge] → output.csv
              ↑            ↑            ↑            ↑
         user_history  images       evidence    risk_flags

POST /claims/review → [same pipeline] → JSON response
```

## Project Structure

```
insurance-damage-claim/
├── src/
│   ├── index.ts                 # CLI entry point (batch mode)
│   ├── server.ts                # Express API server
│   ├── pipeline.ts              # Claim orchestrator
│   ├── agents/
│   │   ├── triage.ts           # Claim intent extraction
│   │   ├── vision.ts           # Image analysis
│   │   └── judge.ts            # Final decision
│   ├── anthropic/
│   │   ├── client.ts           # SDK wrapper (retry, cache, concurrency)
│   │   └── images.ts           # Image processing
│   ├── rules/
│   │   └── validator.ts        # Evidence & risk logic
│   ├── io/
│   │   ├── schema.ts           # Zod schemas & enums
│   │   └── csv.ts              # CSV parsing & writing
│   └── prompts/
│       └── index.ts            # Prompt templates
├── evaluation/
│   └── evaluate.ts             # Evaluation framework
├── dataset/
│   ├── sample_claims.csv       # Labeled examples
│   ├── claims.csv              # Input (unlabeled)
│   ├── user_history.csv        # User risk history
│   ├── evidence_requirements.csv # Evidence checklist
│   └── images/                 # Submitted claim images
├── Dockerfile                   # Container build
├── .env.example                 # Environment variable template
├── package.json
└── tsconfig.json
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
ANTHROPIC_API_KEY=sk-ant-...
CONCURRENCY=6
PORT=3000
```

### 3. Run in Server Mode (API)

```bash
npm run serve
```

Server starts on `http://localhost:3000`. See [API Reference](#api-reference) below.

### 4. Run in Batch Mode (CLI)

Place input files in `dataset/` then:

```bash
npm run predict
```

Results are written to `output.csv`.

### 5. Evaluate

```bash
npm run eval
```

---

## API Reference

### `GET /health`

Health check endpoint.

**Response**

```json
{ "status": "ok", "timestamp": "2026-06-23T10:00:00.000Z" }
```

---

### `POST /claims/review`

Submit a single claim with images for real-time review.

**Content-Type**: `multipart/form-data`

**Request Fields**

| Field          | Type     | Required | Description                                      |
|----------------|----------|----------|--------------------------------------------------|
| `user_id`      | string   | Yes      | Unique user identifier                           |
| `claim_object` | string   | Yes      | One of: `car`, `laptop`, `package`               |
| `user_claim`   | string   | Yes      | Free-text description of the damage              |
| `images`       | file(s)  | Yes      | 1–10 image files (JPEG/PNG/WebP, max 20 MB each) |

**Example (curl)**

```bash
curl -X POST http://localhost:3000/claims/review \
  -F "user_id=u123" \
  -F "claim_object=laptop" \
  -F "user_claim=The screen is cracked" \
  -F "images=@/path/to/screen.jpg"
```

**Success Response (200)**

```json
{
  "user_id": "u123",
  "claim_status": "supported",
  "claim_status_justification": "Visible crack across display panel matches claim.",
  "severity": "high",
  "evidence_standard_met": true,
  "evidence_standard_met_reason": "Clear photo of affected screen area provided.",
  "risk_flags": [],
  "issue_type": "crack",
  "object_part": "screen",
  "supporting_image_ids": ["screen.jpg"],
  "valid_image": true,
  "processing_time_ms": 3240
}
```

**Error Responses**

| Status | Meaning                              |
|--------|--------------------------------------|
| 400    | Missing/invalid fields or no images  |
| 500    | Pipeline or upstream API failure     |

---

## Input/Output Schemas (Batch Mode)

### Input: `dataset/claims.csv`

```csv
user_id,image_paths,user_claim,claim_object
u123,"dataset/images/case_001/img_1.jpg;dataset/images/case_001/img_2.jpg","The screen is cracked",laptop
u456,"dataset/images/case_002/img_1.jpg","Package corner is crushed",package
```

### Output: `output.csv`

```csv
user_id,image_paths,user_claim,claim_object,evidence_standard_met,evidence_standard_met_reason,risk_flags,issue_type,object_part,claim_status,claim_status_justification,supporting_image_ids,valid_image,severity
u123,...,laptop,true,"...",none,crack,screen,supported,"Visible crack matches claim",img_1;img_2,true,high
```

---

## Configuration

### Environment Variables

| Variable          | Default | Description                          |
|-------------------|---------|--------------------------------------|
| `ANTHROPIC_API_KEY` | —     | Anthropic API key **(required)**     |
| `CONCURRENCY`     | `6`     | Max concurrent Anthropic API calls   |
| `PORT`            | `3000`  | HTTP server port                     |

### Claim Object Types

`car` · `laptop` · `package`

### Issue Types

`dent` · `scratch` · `crack` · `glass_shatter` · `broken_part` · `missing_part` · `torn_packaging` · `crushed_packaging` · `water_damage` · `stain` · `none` · `unknown`

### Claim Status Values

| Value                    | Meaning                                      |
|--------------------------|----------------------------------------------|
| `supported`              | Image evidence clearly supports the claim    |
| `contradicted`           | Images show the opposite of the claim        |
| `not_enough_information` | Cannot determine from available images       |

### Risk Flags

| Flag                     | Meaning                                      |
|--------------------------|----------------------------------------------|
| `blurry_image`           | Image quality is poor                        |
| `cropped_or_obstructed`  | Part of claim not visible                    |
| `low_light_or_glare`     | Lighting conditions affect analysis          |
| `wrong_angle`            | Object not photographed from expected angle  |
| `wrong_object`           | Image doesn't match claimed object           |
| `claim_mismatch`         | Image contradicts user claim                 |
| `user_history_risk`      | User has concerning claim history            |
| `manual_review_required` | Requires human review                        |

---

## Deployment (Docker + AWS)

### Build the Docker Image

Create a `Dockerfile` at the project root:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

Build and test locally:

```bash
docker build -t insurance-claim-review .
docker run -p 3000:3000 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -v $(pwd)/dataset:/app/dataset \
  insurance-claim-review
```

### AWS Deployment

See the [AWS Cloud Resources](#aws-cloud-resources) section below for the full resource list.

**Quick path: ECS Fargate + ALB**

1. Push image to ECR:
   ```bash
   aws ecr get-login-password --region us-east-1 | \
     docker login --username AWS --password-stdin <account>.dkr.ecr.us-east-1.amazonaws.com
   docker tag insurance-claim-review:latest <account>.dkr.ecr.us-east-1.amazonaws.com/insurance-claim-review:latest
   docker push <account>.dkr.ecr.us-east-1.amazonaws.com/insurance-claim-review:latest
   ```

2. Store the API key in AWS Secrets Manager:
   ```bash
   aws secretsmanager create-secret \
     --name /insurance-claim/anthropic-api-key \
     --secret-string '{"ANTHROPIC_API_KEY":"sk-ant-..."}'
   ```

3. Create an ECS Fargate task definition pointing to the ECR image, injecting the secret as an environment variable.

4. Deploy behind an ALB with HTTPS (ACM certificate) on port 443 → target port 3000.

5. Mount an EFS volume (or sync from S3 on startup) for the `dataset/` directory so `user_history.csv` and `evidence_requirements.csv` are available at runtime.

---

## AWS Cloud Resources

| # | Resource | AWS Service | Purpose |
|---|----------|-------------|---------|
| 1 | Container image registry | **ECR** | Stores versioned Docker images |
| 2 | Container compute | **ECS Fargate** | Runs the Express server (serverless containers) |
| 3 | Load balancer | **ALB** | HTTPS termination, health checks, routing |
| 4 | TLS certificate | **ACM** | Free managed SSL/TLS cert for your domain |
| 5 | DNS | **Route 53** | Domain name → ALB alias record |
| 6 | Secret storage | **Secrets Manager** | Stores `ANTHROPIC_API_KEY` (and rotates it) |
| 7 | Config storage | **SSM Parameter Store** | Non-secret env vars (`CONCURRENCY`, `PORT`) |
| 8 | Object storage | **S3** | Stores dataset CSVs and processed images |
| 9 | Shared file system | **EFS** | Mounts `dataset/` into containers at runtime |
| 10 | Networking | **VPC + Subnets + SGs** | Private subnets for Fargate tasks; SG limits inbound to ALB only |
| 11 | NAT Gateway | **NAT Gateway** | Lets private-subnet tasks reach the Anthropic API |
| 12 | Logging | **CloudWatch Logs** | Streams container stdout/stderr |
| 13 | Metrics & alarms | **CloudWatch Metrics** | CPU, memory, request latency, 5xx rate alarms |
| 14 | Access control | **IAM Roles** | Task execution role (ECR pull, Secrets read, EFS mount) |
| 15 | CI/CD pipeline | **CodePipeline + CodeBuild** | Builds image on git push, deploys to ECS |
| 16 | Auto-scaling | **ECS Application Auto Scaling** | Scales task count on CPU/request-count metrics |
| 17 | API gateway *(optional)* | **API Gateway (HTTP API)** | Rate limiting, API keys, WAF integration |
| 18 | WAF *(optional)* | **AWS WAF** | Blocks malicious uploads, rate-limits by IP |
| 19 | Cost alerts | **AWS Budgets** | Email alert when monthly spend exceeds threshold |

**Minimum viable set** (dev/staging): ECR + ECS Fargate + ALB + ACM + Secrets Manager + VPC + NAT Gateway + CloudWatch Logs + IAM.

**Add for production**: Route 53 + EFS + S3 + Auto Scaling + CloudWatch Alarms + AWS Budgets.

---

## API Usage & Costs

### Token Estimation per Claim

| Stage  | Model  | Tokens (avg) |
|--------|--------|-------------|
| Triage | Haiku  | ~300        |
| Vision | Sonnet | ~3,500 + images |
| Judge  | Sonnet | ~400        |

### Pricing (Claude 3.5 Sonnet)

| Token type     | Rate            |
|----------------|-----------------|
| Input          | $3 / 1M tokens  |
| Output         | $15 / 1M tokens |
| Cache creation | $0.375 / 1M     |
| Cache read     | $0.03 / 1M      |

**Estimated cost per claim**: ~$0.015–0.025

### Rate Limiting

- Default: 6 concurrent requests (`CONCURRENCY`)
- Retry: 5 attempts with exponential backoff (500ms base, ×2^attempt)
- Retried on: 429 · 529 · 5xx

---

## Development

### Adding a New Agent

1. Create agent in `src/agents/myagent.ts`
2. Define input/output schemas in `src/io/schema.ts`
3. Add prompt template in `src/prompts/index.ts`
4. Integrate in `src/pipeline.ts`

### Running Tests & Evaluation

```bash
npm run eval             # evaluate on sample_claims.csv
cat evaluation/evaluation_report.md   # view metrics
```

### Type Checking

```bash
npm run type-check
```

### Debug Logging

```bash
DEBUG=* npm run predict
```

---

## Error Handling

| Scenario                  | Behaviour                        |
|---------------------------|----------------------------------|
| Missing image files       | Skips image, logs warning        |
| Invalid CSV rows          | Skips row, logs warning          |
| API rate limits (429/529) | Automatic retry with backoff     |
| Malformed JSON response   | Logs detailed error, skips claim |
| Missing API key           | Fatal — exits on startup         |

---

## Performance Tips

1. **Batch Processing**: Tune `CONCURRENCY` (default 6) for your Anthropic TPM quota
2. **Image Deduplication**: SHA1-based deduplication within a run avoids re-uploading identical images
3. **Prompt Caching**: System prompts are cached across calls of the same claim type
4. **Selective Vision**: Vision stage is skipped when no valid images are present

---

## Evaluation Metrics

The evaluation report (`evaluation/evaluation_report.md`) includes:

- Accuracy, precision, recall, F1 score
- Confusion matrix by claim status
- Token usage and cost estimates
- Image processing statistics
- TPM/RPM considerations
- Latency analysis (avg, p95)

---

## Troubleshooting

### "API key not found"
Check `.env` exists and has `ANTHROPIC_API_KEY` set. Verify the key at https://console.anthropic.com/.

### "Image not found"
Check file paths are correct relative to the project root. Use forward slashes; separate multiple paths with semicolons.

### "Invalid JSON response"
The model returned non-JSON text. Check prompt templates for clarity, then retry with `DEBUG=*`.

### "Rate limit exceeded"
System retries automatically. If the problem persists, reduce `CONCURRENCY` to stay within your TPM quota.

---

## Future Enhancements

- [ ] Fine-tuned models for domain-specific accuracy
- [ ] OCR for document analysis (receipts, invoices)
- [ ] Video clip analysis for package claims
- [ ] Interactive manual review UI
- [ ] Continuous learning from adjuster feedback
- [ ] Multi-image evidence synthesis

---

## License

MIT
