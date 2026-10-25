# GitHub Pages + AWS Lambda

Site: https://destivano.github.io/salah_simulator/

The Pages workflow publishes only `index.html`, `config.js`, and `.nojekyll`. The simulator and local search work before AWS is connected. The Q&A panel shows a setup message until a backend URL is configured.

## 1. Upload the Lambda ZIP

Use `dist/salah-simulator-lambda.zip`. It contains `lambda.mjs`, `qa-service.mjs`, and the source documents under `docs/`. It contains **no API keys**. No dependencies, layers, build step, or HTTP server are required on AWS.

In the AWS Lambda console:

1. Create a function named `salah-simulator-qa` with **Node.js 24.x**. Either architecture works. Use a basic execution role with CloudWatch Logs permissions.
2. Under Code, upload the ZIP. Set **Runtime settings → Handler** to `lambda.handler`.
3. Set **General configuration → Timeout** to **2 minutes**, and memory to **256 MB**.
4. Under Environment variables, enter:

   | Variable | Value |
   | --- | --- |
   | `GROQ_API_KEY` | Your Groq key from your local `.env` |
   | `COMMAND_CODE_API_KEY` | Your Command Code key from your local `.env` |
   | `ALLOWED_ORIGINS` | `https://destivano.github.io` |

   The origin has **no repository path and no trailing slash**. For additional sites, use comma-separated exact origins. Do not put keys in GitHub variables, `config.js`, or the ZIP.

5. Leave the function outside a VPC unless you have configured outbound internet access. It must reach both providers over HTTPS.
6. Under Configuration → Function URL, create a URL with **Auth type: NONE** and **Invoke mode: BUFFERED**. Leave Function URL CORS configuration **disabled/unset**: the handler supplies CORS headers, including preflight responses. Do not configure a second set of CORS headers in AWS.
7. Confirm the resource policy allows public Function URL invocation. When creating a NONE URL in the console, AWS normally adds this. Current Function URLs require both `lambda:InvokeFunctionUrl` (condition `lambda:FunctionUrlAuthType = NONE`) and `lambda:InvokeFunction` (condition `lambda:InvokedViaFunctionUrl = true`) permissions for public invocation. If AWS shows a policy warning, use the console's suggested policy rather than granting unrestricted invocation outside the URL.
8. Set reserved concurrency to **2** as an initial ceiling (or the smallest value your account permits), and configure provider spending limits and AWS billing alerts.

This is an anonymous public Q&A endpoint. Origin checks control browser access, **not authentication**: non-browser clients can forge an Origin header. Reserved concurrency limits simultaneous work, not total spending. For a restricted audience, add actual authentication before sharing the service. Never embed a shared “secret” in the public frontend.

## 2. Connect the website

Copy the Function URL, for example `https://abc.lambda-url.eu-west-1.on.aws/`.

1. In the GitHub repository, open **Settings → Secrets and variables → Actions → Variables**.
2. Create the repository variable **`QA_API_URL`** with that URL. This URL is public; it is not a secret. Use only the URL origin, without `/api/ask`.
3. Open **Actions → Deploy GitHub Pages → Run workflow** on `main`. Future pushes automatically use the saved URL.

Alternatively, provide the Function URL to your coding assistant to complete this connection for you. No frontend code changes are needed. A one-off URL can also be supplied in the workflow's `api_url` input, but save the variable for subsequent deployments.

If Pages has not been enabled, set **Settings → Pages → Source → GitHub Actions**. The repository includes the deployment workflow.

## 3. Verify AWS

Test the models route with an Origin header (ordinary address-bar navigation does not send this header):

```powershell
$api = 'https://YOUR-ID.lambda-url.YOUR-REGION.on.aws'
Invoke-RestMethod -Uri "$api/api/models" -Headers @{ Origin = 'https://destivano.github.io' }
```

Then open the Pages site, choose a model, ask a question, and open a citation. For a Lambda console test, use:

```json
{
  "version": "2.0",
  "rawPath": "/api/models",
  "headers": { "origin": "https://destivano.github.io" },
  "requestContext": { "http": { "method": "GET" } },
  "isBase64Encoded": false
}
```

- AWS `403` before the handler runs: check the Function URL auth type and resource policy.
- Handler `403`: check `ALLOWED_ORIGINS` and the request Origin.
- Browser CORS errors: remove duplicate Function URL CORS settings; confirm the configured URL is correct.
- Timeouts: confirm the 120-second function timeout and outbound internet access.
- Unavailable models: check provider keys, account access, limits, and credits. A catalog entry is not a guarantee of account entitlement.
- Rejected answer structure/citations: CloudWatch records `qa_validation_failed` with the model, attempt number and structural reasons (such as `unknown_sourceId` or `answer_requires_sourceIds`). These records exclude questions, answer text and keys. Clarifications/unsupported responses may omit `sourceIds`; the handler normalizes that to an empty list. Answers still require valid citations.

## Updating sources or code

- Frontend changes deploy automatically on pushes to `main`.
- Backend/source changes require uploading a new ZIP to Lambda. Source edits on GitHub alone do not update an already uploaded function.
- Run `npm test`, then `python scripts/package-lambda.py` locally. Python 3 is needed only to build the ZIP.
- Alternatively, download the `lambda-deployment` artifact from **Actions → Package AWS Lambda**. Extract the GitHub artifact archive and upload the **inner** `salah-simulator-lambda.zip` to AWS.
- The neighboring `.sha256` file lets you verify the ZIP checksum.
- Keep deployment notes outside `docs/`: all `.txt` and `.md` files in `docs/` become model source material.

Official references: [AWS ZIP packaging](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-package.html), [Function URL configuration and CORS](https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html), [Function URL invocation](https://docs.aws.amazon.com/lambda/latest/dg/urls-invocation.html), [GitHub Pages publishing](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
