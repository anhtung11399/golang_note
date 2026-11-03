// Dựng trang tĩnh: src/lessons/*.html (đoạn nội dung) → dist/*.html.
// Trong nội dung bài có thể dùng:
//   <pre lang="go" file="main.go" mark="bad|good"> code thô (không cần escape) </pre>
//   <pre lang="out"> kết quả in ra màn hình khi chạy (không có nút sao chép) </pre>
//   <fig type="flow|seq|stack" caption="..." dir="down"> mô tả sơ đồ </fig>
//   <quiz q="Câu hỏi">  - sai / + đúng / ? giải thích  </quiz>
//   <aside class="fe|warn|tip|real|prod"> ... </aside>
import fs from 'node:fs';
import path from 'node:path';
import { LESSONS, PHASES, EXTRA } from './src/lessons.mjs';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const SRC = path.join(ROOT, 'src');
const OUT = ROOT; // GitHub Pages phục vụ thẳng từ gốc repo: index.html phải nằm ở gốc
const SITE = 'Go cho dân Frontend';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ---------------- Tô màu code ---------------- */
const words = (s) => new Set(s.split(/\s+/).filter(Boolean));
const LANG = {
  go: {
    kw: words('break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var'),
    ty: words('bool byte complex64 complex128 error float32 float64 int int8 int16 int32 int64 rune string uint uint8 uint16 uint32 uint64 uintptr any comparable'),
    bi: words('append cap clear close copy delete len make max min new panic print println recover true false nil iota'),
    com: /\/\/[^\n]*|\/\*[\s\S]*?\*\//,
    str: /"(?:[^"\\\n]|\\.)*"|`[^`]*`|'(?:[^'\\\n]|\\.)+'/,
  },
  ts: {
    kw: words('const let var function return if else for of in new class interface type extends implements import export from async await try catch finally throw switch case default break continue while do typeof instanceof this'),
    ty: words('string number boolean any unknown void never null undefined Promise Record Array'),
    bi: words('true false console JSON fetch'),
    com: /\/\/[^\n]*|\/\*[\s\S]*?\*\//,
    str: /"(?:[^"\\\n]|\\.)*"|`[^`]*`|'(?:[^'\\\n]|\\.)*'/,
  },
  sql: {
    kw: words('select from where insert into values update set delete create table index primary key references foreign not null unique default join left right inner outer on group by order limit offset and or as desc asc begin commit rollback for returning explain analyze having in is exists cascade alter add column check union distinct case when then else end with like between serial bigserial transaction isolation level read committed repeatable serializable skip locked nowait conflict do nothing if drop using count sum avg max min now'),
    ty: words('int integer bigint text varchar boolean timestamptz timestamp date uuid jsonb numeric smallint'),
    bi: words('true false'),
    com: /--[^\n]*/,
    str: /'(?:[^'\n]|'')*'/,
    ci: true,
  },
  sh: {
    kw: words('cd ls mkdir echo export curl go docker git npm npx sudo cat brew apt if then fi for do done wrangler psql redis-cli kubectl'),
    ty: words(''),
    bi: words(''),
    com: /#[^\n]*/,
    str: /"(?:[^"\\\n]|\\.)*"|'[^'\n]*'/,
  },
  docker: {
    kw: words('FROM RUN COPY WORKDIR CMD ENTRYPOINT ENV EXPOSE ARG AS USER'),
    ty: words(''),
    bi: words(''),
    com: /#[^\n]*/,
    str: /"(?:[^"\\\n]|\\.)*"/,
  },
  yaml: { kw: words(''), ty: words(''), bi: words('true false null'), com: /#[^\n]*/, str: /"(?:[^"\\\n]|\\.)*"|'[^'\n]*'/ },
  json: { kw: words(''), ty: words(''), bi: words('true false null'), com: /(?!)/, str: /"(?:[^"\\\n]|\\.)*"/ },
  proto: {
    kw: words('syntax package import option message service rpc returns stream enum repeated optional oneof map reserved'),
    ty: words('string int32 int64 uint32 uint64 bool bytes double float sint32 sint64 fixed32 fixed64'),
    bi: words('true false'),
    com: /\/\/[^\n]*/,
    str: /"(?:[^"\\\n]|\\.)*"/,
  },
  http: { kw: words('GET POST PUT PATCH DELETE HEAD OPTIONS HTTP'), ty: words(''), bi: words(''), com: /(?!)/, str: /(?!)/ },
  text: null,
};

function highlight(code, lang) {
  const L = LANG[lang];
  if (!L) return esc(code);
  const re = new RegExp(`(${L.com.source})|(${L.str.source})|(\\b\\d[\\d_]*(?:\\.\\d+)?(?:ms|s|m|h)?\\b)|([A-Za-z_][\\w]*)`, 'g');
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(code))) {
    if (m[0] === '') { re.lastIndex++; continue; }
    out += esc(code.slice(last, m.index));
    last = m.index + m[0].length;
    const t = m[0];
    if (m[1]) out += `<span class="c">${esc(t)}</span>`;
    else if (m[2]) out += `<span class="s">${esc(t)}</span>`;
    else if (m[3]) out += `<span class="n">${esc(t)}</span>`;
    else {
      const k = L.ci ? t.toLowerCase() : t;
      if (L.kw.has(k)) out += `<span class="k">${esc(t)}</span>`;
      else if (L.ty.has(k)) out += `<span class="t">${esc(t)}</span>`;
      else if (L.bi.has(k)) out += `<span class="b">${esc(t)}</span>`;
      else if (code[last] === '(' && lang !== 'sql') out += `<span class="f">${esc(t)}</span>`;
      else out += esc(t);
    }
  }
  return out + esc(code.slice(last));
}

const LANG_NAME = { proto: 'Protobuf',  go: 'Go', ts: 'TypeScript', sql: 'SQL', sh: 'Terminal', docker: 'Dockerfile', yaml: 'YAML', json: 'JSON', http: 'HTTP', text: '' };

function attrs(s) {
  const a = {};
  for (const m of s.matchAll(/(\w+)="([^"]*)"/g)) a[m[1]] = m[2];
  return a;
}

function codeBlock(a, body) {
  const code = body.replace(/^\n/, '').replace(/\s+$/, '');
  if (a.lang === 'out') {
    // Mô phỏng ảnh chụp cửa sổ terminal: dòng "$ ..." là lệnh gõ vào, còn lại là chương trình in ra
    const body = code.split('\n').map((l) => l.startsWith('$ ')
      ? `<span class="t-p">$</span> <span class="t-c">${esc(l.slice(2))}</span>`
      : l.startsWith('postgres=# ') ? `<span class="t-p">postgres=#</span> <span class="t-c">${esc(l.slice(11))}</span>` : esc(l)).join('\n');
    // sim="1": kết quả viết tay để minh hoạ (chưa chạy thật), ghi rõ cho người học biết
    const sim = a.sim ? '<b class="term-sim">Mô phỏng</b>' : '';
    const title = a.file || (a.sim ? 'Terminal — kết quả minh hoạ' : 'Terminal — kết quả khi chạy');
    return `<div class="term${a.sim ? ' sim' : ''}" role="img" aria-label="${esc(title)}"><div class="term-h"><i></i><i></i><i></i><span>${esc(title)}</span>${sim}</div><pre>${body}</pre></div>`;
  }
  const lang = a.lang || 'text';
  // Khối Go không có dòng package là một đoạn trích trong chương trình lớn hơn: ghi rõ để người học không chạy riêng
  const part = lang === 'go' && !/^package /m.test(code);
  const label = (a.file || LANG_NAME[lang] || lang) + (part ? ' · trích đoạn' : '');
  const mark = a.mark === 'bad' ? '<span class="mark bad">Sai / nguy hiểm</span>' : a.mark === 'good' ? '<span class="mark good">Đúng / nên làm</span>' : '';
  return `<div class="code${a.mark ? ' ' + a.mark : ''}"><div class="code-h"><span>${esc(label)}</span>${mark}<button class="copy" type="button">Sao chép</button></div><pre><code>${highlight(code, lang)}</code></pre></div>`;
}

/* ---------------- Sơ đồ SVG ---------------- */
const TAGS = { go: 'go', db: 'db', cache: 'cache', ext: 'ext', warn: 'warn', fe: 'fe', q: 'q', ok: 'ok' };
function node(str) {
  let tag = '';
  const m = str.match(/^\s*\[(\w+)\]\s*/);
  if (m) { tag = TAGS[m[1]] || ''; str = str.slice(m[0].length); }
  const i = str.indexOf(' / ');
  return i < 0 ? { tag, title: str.trim(), sub: '' } : { tag, title: str.slice(0, i).trim(), sub: str.slice(i + 3).trim() };
}
const tw = (s, size = 14) => [...s].length * size * 0.56;
const text = (x, y, s, cls = 't', anchor = 'middle') => `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${esc(s)}</text>`;

/** Chia nhãn dài thành nhiều dòng vừa chiều rộng w. */
function wrap(s, w, size) {
  const out = [];
  let cur = '';
  for (const word of s.split(' ')) {
    const t = cur ? cur + ' ' + word : word;
    if (cur && tw(t, size) > w) { out.push(cur); cur = word; } else cur = t;
  }
  if (cur) out.push(cur);
  return out;
}

function box(x, y, w, h, n) {
  const cy = n.sub ? y + h / 2 - 3 : y + h / 2 + 5;
  return `<g class="nd ${n.tag}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/>${text(x + w / 2, cy, n.title, 'tt')}${n.sub ? text(x + w / 2, y + h / 2 + 15, n.sub, 'ts') : ''}</g>`;
}

function svg(w, h, inner, label) {
  return `<svg viewBox="0 0 ${w} ${h}" style="min-width:${Math.min(w, 600)}px;max-width:${w}px" role="img" aria-label="${esc(label || 'Sơ đồ')}">${inner}</svg>`;
}

function flow(src, a) {
  const items = [];
  for (const raw of src.split('\n').map((l) => l.trim()).filter(Boolean)) {
    if (/^<?->/.test(raw)) items.push({ arrow: true, both: raw.startsWith('<'), label: raw.replace(/^<?->\s*/, '') });
    else {
      if (items.length && !items[items.length - 1].arrow) items.push({ arrow: true, label: '' });
      items.push(node(raw));
    }
  }
  const nodes = items.filter((i) => !i.arrow);
  const H = 66;
  if (a.dir === 'down') {
    const W = Math.max(200, ...nodes.map((n) => Math.max(tw(n.title, 15), tw(n.sub, 12)) + 36));
    const labelW = Math.max(0, ...items.filter((i) => i.arrow).map((i) => tw(i.label, 13)));
    const total = W + 40 + labelW + 20;
    let y = 10;
    let inner = '';
    const x = 10;
    for (const it of items) {
      if (it.arrow) {
        const cx = x + W / 2;
        inner += `<line x1="${cx}" y1="${y}" x2="${cx}" y2="${y + 44}" class="ln" marker-end="url(#ar)"${it.both ? ' marker-start="url(#ar)"' : ''}/>`;
        if (it.label) inner += text(cx + 14, y + 27, it.label, 'tl', 'start');
        y += 48;
      } else {
        inner += box(x, y, W, H, it);
        y += H + 4;
      }
    }
    return svg(Math.max(total, W + 20), y + 6, inner, a.caption);
  }
  let x = 10;
  let inner = '';
  for (const it of items) {
    if (it.arrow) {
      const g = Math.max(70, tw(it.label, 13) + 24);
      inner += `<line x1="${x + 2}" y1="${10 + H / 2}" x2="${x + g - 4}" y2="${10 + H / 2}" class="ln" marker-end="url(#ar)"${it.both ? ' marker-start="url(#ar)"' : ''}/>`;
      if (it.label) inner += text(x + g / 2, 10 + H / 2 - 9, it.label, 'tl');
      x += g;
    } else {
      const w = Math.max(116, tw(it.title, 15) + 30, tw(it.sub, 12) + 26);
      inner += box(x, 10, w, H, it);
      x += w;
    }
  }
  return svg(x + 10, H + 20, inner, a.caption);
}

function seq(src, a) {
  const lines = src.split('\n').map((l) => l.trim()).filter(Boolean);
  const actors = lines.shift().replace(/^actors:\s*/, '').split(',').map((s) => node(s.trim()));
  const idx = (name) => actors.findIndex((x) => x.title === name.trim());
  const msgs = lines.map((l) => {
    let m;
    if ((m = l.match(/^==\s*(.*?)\s*==$/))) return { div: m[1] };
    if ((m = l.match(/^note\s+([^:]+):\s*(.*)$/))) return { note: m[2], who: m[1].split(',').map(idx) };
    m = l.match(/^(.+?)\s*(-->|->)\s*(.+?):\s*(.*)$/);
    if (!m) throw new Error('seq: không hiểu dòng ' + l);
    return { from: idx(m[1]), to: idx(m[3]), dash: m[2] === '-->', label: m[4] };
  });
  for (const m of msgs) if (m.from === -1 || m.to === -1) throw new Error('seq: sai tên actor ở ' + JSON.stringify(m));
  let gap = 170;
  for (const n of actors) gap = Math.max(gap, tw(n.title, 15) + 40);
  gap = Math.min(gap, actors.length > 4 ? 190 : 240);
  const bw = Math.min(gap - 20, Math.max(120, ...actors.map((n) => tw(n.title, 15) + 30)));
  const cx = (i) => 20 + bw / 2 + i * gap;
  const W = cx(actors.length - 1) + bw / 2 + 20;
  let y = 90;
  let inner = '';
  for (const m of msgs) {
    if (m.div !== undefined) {
      inner += `<line x1="10" y1="${y + 6}" x2="${W - 10}" y2="${y + 6}" class="dv"/>` + `<rect x="${W / 2 - tw(m.div, 12) / 2 - 10}" y="${y - 6}" width="${tw(m.div, 12) + 20}" height="22" rx="11" class="dvb"/>` + text(W / 2, y + 10, m.div, 'ts');
      y += 38;
    } else if (m.note !== undefined) {
      const xs = m.who.map(cx);
      const x1 = Math.min(...xs) - 70;
      const x2 = Math.max(...xs) + 70;
      const w = Math.max(x2 - x1, tw(m.note, 13) + 24);
      const nx = (x1 + x2) / 2 - w / 2;
      const cx2 = Math.min(Math.max(nx, 10), W - w - 10);
      inner += `<rect x="${cx2}" y="${y - 12}" width="${w}" height="28" rx="6" class="nt"/>` + text(cx2 + w / 2, y + 6, m.note, 'tn');
      y += 42;
    } else if (m.from === m.to) {
      const x = cx(m.from);
      inner += `<path d="M${x} ${y} h36 v20 h-32" class="ln${m.dash ? ' ds' : ''}" fill="none" marker-end="url(#ar)"/>` + text(x + 44, y + 14, m.label, 'tl', 'start');
      y += 44;
    } else {
      const x1 = cx(m.from);
      const x2 = cx(m.to);
      const d = x2 > x1 ? 1 : -1;
      const lines = wrap(m.label, Math.abs(x2 - x1) - 16, 13);
      if (lines.length > 1) y += 16;
      inner += `<line x1="${x1}" y1="${y}" x2="${x2 - d * 4}" y2="${y}" class="ln${m.dash ? ' ds' : ''}" marker-end="url(#ar)"/>`;
      lines.forEach((t, k) => (inner += text((x1 + x2) / 2, y - 7 - (lines.length - 1 - k) * 16, t, 'tl')));
      y += 42;
    }
  }
  let heads = '';
  actors.forEach((n, i) => {
    heads += `<line x1="${cx(i)}" y1="66" x2="${cx(i)}" y2="${y}" class="lf"/>`;
    heads += box(cx(i) - bw / 2, 10, bw, 54, n);
  });
  return svg(W, y + 10, heads + inner, a.caption);
}

function stack(src, a) {
  const rows = src.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [head, desc] = l.split('::').map((s) => s.trim());
    return { ...node(head), desc: desc || '' };
  });
  const lw = Math.max(170, ...rows.map((r) => tw(r.title, 15) + 40));
  const dw = Math.max(0, ...rows.map((r) => tw(r.desc, 13)));
  const W = Math.max(lw + 40 + dw + 20, 360);
  let y = 10;
  let inner = '';
  rows.forEach((r, i) => {
    inner += box(10, y, lw, 52, { ...r, sub: r.sub });
    if (r.desc) inner += text(lw + 30, y + 31, r.desc, 'tl', 'start');
    if (i < rows.length - 1) inner += `<line x1="${10 + lw / 2}" y1="${y + 52}" x2="${10 + lw / 2}" y2="${y + 70}" class="ln" marker-end="url(#ar)"${a.both ? ' marker-start="url(#ar)"' : ''}/>`;
    y += 72;
  });
  return svg(W, y - 10, inner, a.caption);
}

function fig(a, body) {
  const f = { flow, seq, stack }[a.type];
  if (!f) throw new Error('fig: không có kiểu ' + a.type);
  return `<figure class="dg">${f(body, a)}${a.caption ? `<figcaption>${a.caption}</figcaption>` : ''}</figure>`;
}

function quiz(a, body) {
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  const opts = lines.filter((l) => /^[+-]\s/.test(l));
  const why = lines.filter((l) => l.startsWith('?')).map((l) => l.slice(1).trim()).join(' ');
  return `<div class="quiz"><p class="qq"><b>Câu hỏi nhanh.</b> ${a.q}</p><div class="qo">${opts
    .map((o) => `<button type="button" class="opt"${o[0] === '+' ? ' data-ok' : ''}>${o.slice(2)}</button>`)
    .join('')}</div><p class="why" hidden>${why}</p></div>`;
}

/* ---------------- Ghép trang ---------------- */
/* ---------------- Sơ đồ kiến trúc AWS ----------------
<arch w="760" h="400" caption="...">
group x y w h kind "nhãn"        kind: cloud | region | vpc | az | public | private | account | onprem | ou | plain
node id x y svc "nhãn" ["dòng 2"] x, y là tâm biểu tượng
edge a b "nhãn" [dash] [both] [curve=N]   nối hai node
arrow x1 y1 x2 y2 "nhãn" [dash] [both]  mũi tên tự do
text x y "chữ" [small] [bold] [anchor=start|middle|end]
</arch> */
const SVC = {
  // compute (cam)
  ec2: ['EC2', 'cp'], asg: ['ASG', 'cp'], lambda: ['λ', 'cp'], ecs: ['ECS', 'cp'], eks: ['EKS', 'cp'], fargate: ['FGT', 'cp'], beanstalk: ['EB', 'cp'], ami: ['AMI', 'cp'], imagebuilder: ['IB', 'cp'], batch: ['BAT', 'cp'],
  // storage (xanh lá)
  s3: ['S3', 'st'], ebs: ['EBS', 'st'], efs: ['EFS', 'st'], fsx: ['FSx', 'st'], snapshot: ['SNAP', 'st'], backup: ['BKP', 'st'], glacier: ['GLC', 'st'], datasync: ['DS', 'st'], sgw: ['SGW', 'st'], drs: ['DRS', 'st'],
  // database (tím hồng)
  rds: ['RDS', 'db'], aurora: ['AUR', 'db'], dynamodb: ['DDB', 'db'], elasticache: ['EC', 'db'], dax: ['DAX', 'db'], proxy: ['PRX', 'db'],
  // networking (tím)
  vpc: ['VPC', 'nw'], igw: ['IGW', 'nw'], nat: ['NAT', 'nw'], alb: ['ALB', 'nw'], nlb: ['NLB', 'nw'], gwlb: ['GWLB', 'nw'], elb: ['ELB', 'nw'], route53: ['R53', 'nw'], cloudfront: ['CF', 'nw'], tgw: ['TGW', 'nw'], vgw: ['VGW', 'nw'], cgw: ['CGW', 'nw'], dx: ['DX', 'nw'], vpn: ['VPN', 'nw'], endpoint: ['VPCE', 'nw'], ga: ['GA', 'nw'], resolver: ['RSLV', 'nw'], peering: ['PCX', 'nw'], apigw: ['API', 'nw'], privatelink: ['PL', 'nw'], eni: ['ENI', 'nw'], dxgw: ['DXGW', 'nw'], nfw: ['NFW', 'sec'],
  // security (đỏ)
  iam: ['IAM', 'sec'], kms: ['KMS', 'sec'], waf: ['WAF', 'sec'], shield: ['SHD', 'sec'], guardduty: ['GD', 'sec'], inspector: ['INS', 'sec'], macie: ['MAC', 'sec'], securityhub: ['SH', 'sec'], acm: ['ACM', 'sec'], secrets: ['SM', 'sec'], sg: ['SG', 'sec'], nacl: ['NACL', 'sec'], sts: ['STS', 'sec'], cognito: ['COG', 'sec'], detective: ['DET', 'sec'], identitycenter: ['IDC', 'sec'], firewallmanager: ['FMS', 'sec'], accessanalyzer: ['AA', 'sec'], cloudhsm: ['HSM', 'sec'], securitylake: ['SL', 'sec'], auditmanager: ['AM', 'sec'], artifact: ['ART', 'sec'],
  // management (hồng)
  cloudwatch: ['CW', 'mg'], alarm: ['ALM', 'mg'], logs: ['LOGS', 'mg'], cloudtrail: ['CT', 'mg'], config: ['CFG', 'mg'], ssm: ['SSM', 'mg'], cfn: ['CFN', 'mg'], stackset: ['SS', 'mg'], organizations: ['ORG', 'mg'], controltower: ['CTW', 'mg'], trustedadvisor: ['TA', 'mg'], health: ['HLT', 'mg'], xray: ['XR', 'mg'], synthetics: ['SYN', 'mg'], ram: ['RAM', 'mg'], servicecatalog: ['SC', 'mg'], computeoptimizer: ['CO', 'mg'], grafana: ['GRF', 'mg'], prometheus: ['PROM', 'mg'],
  // integration (hồng đậm)
  eventbridge: ['EVB', 'ai'], sns: ['SNS', 'ai'], sqs: ['SQS', 'ai'], stepfunctions: ['SFN', 'ai'], kinesis: ['KDS', 'ai'], firehose: ['FH', 'ai'], scheduler: ['SCH', 'ai'], chatbot: ['CHAT', 'ai'],
  // devtools (xanh dương)
  codedeploy: ['CD', 'dv'], codepipeline: ['CP', 'dv'], ecr: ['ECR', 'cp'], athena: ['ATH', 'an'], opensearch: ['OS', 'an'], quicksight: ['QS', 'an'],
  // backend chung (site Go)
  gosvc: ['GO', 'go'], goapi: ['API', 'go'], worker: ['WRK', 'go'], grpcsvc: ['gRPC', 'go'], pg: ['PG', 'db'], postgres: ['PG', 'db'], mysql: ['SQL', 'db'], redis: ['RDS', 'db'], kafka: ['KFK', 'ai'], nats: ['NATS', 'ai'], rabbit: ['MQ', 'ai'], queue: ['QUEUE', 'ai'], cron: ['CRON', 'mg'], k8s: ['K8S', 'nw'], pod: ['POD', 'cp'], svc: ['SVC', 'nw'], ingress: ['ING', 'nw'], lb: ['LB', 'nw'], nginx: ['NGX', 'nw'], cdn: ['CDN', 'nw'], browser: ['WEB', 'gen'], mobile: ['APP', 'gen'], prom: ['PROM', 'mg'], jaeger: ['TRACE', 'mg'], minio: ['OBJ', 'st'], docker: ['DOCK', 'dv'], ci: ['CI', 'dv'], git: ['GIT', 'dv'], mutex: ['LOCK', 'sec'], chan: ['CHAN', 'go'], goroutine: ['G', 'go'], ctx: ['CTX', 'go'], handler: ['H', 'go'], mw: ['MW', 'go'], service: ['SVC', 'go'], store: ['REPO', 'go'], oauth: ['OIDC', 'sec'], jwt: ['JWT', 'sec'], email: ['MAIL', 'ai'], smtp: ['SMTP', 'ai'], ws: ['WS', 'nw'], proto: ['PB', 'go'], test: ['TEST', 'dv'], deploy: ['DEP', 'cp'], cm: ['CM', 'mg'], secret: ['SEC', 'sec'], hpa: ['HPA', 'mg'], topic: ['TOPIC', 'ai'], dlq: ['DLQ', 'bad'], gin: ['GIN', 'go'], openapi: ['OAS', 'dv'], gorm: ['ORM', 'go'], sqlc: ['SQLC', 'go'], node: ['NODE', 'cp'], kubectl: ['CTL', 'dv'],
  // chung
  cpu: ['CPU', 'gen'], user: ['USER', 'gen'], users: ['USERS', 'gen'], server: ['SRV', 'gen'], dc: ['DC', 'gen'], internet: ['WWW', 'gen'], laptop: ['PC', 'gen'], admin: ['ADM', 'gen'], hacker: ['!', 'bad'], file: ['FILE', 'gen'], app: ['APP', 'gen'], db_onprem: ['DB', 'gen'], dns: ['DNS', 'gen'],
};
function arch(a, body) {
  const W = +a.w || 760, H = +a.h || 400;
  const nodes = {};
  let back = '', mid = '', front = '';
  const q = (line) => { const out = []; line.replace(/"([^"]*)"|(\S+)/g, (_, s, t) => { out.push(s !== undefined ? { s } : t); return ''; }); return out; };
  const strs = (arr) => arr.filter((x) => typeof x === 'object').map((x) => x.s);
  const flags = (arr) => arr.filter((x) => typeof x === 'string');
  const opt = (arr, k) => { const f = flags(arr).find((x) => x.startsWith(k + '=')); return f ? f.slice(k.length + 1) : null; };
  const lines = body.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  for (const l of lines) {
    const t = q(l);
    const cmd = t[0];
    if (cmd === 'group') {
      const [x, y, w, h] = t.slice(1, 5).map(Number);
      const kind = t[5];
      const label = strs(t)[0] || '';
      back += `<g class="ag ag-${kind}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${kind === 'cloud' || kind === 'onprem' ? 14 : 8}"/><text x="${x + 10}" y="${y + 18}" class="ag-t">${esc(label)}</text></g>`;
    } else if (cmd === 'node') {
      const id = t[1]; const x = +t[2], y = +t[3]; const svc = t[4];
      const [abbr, cat] = SVC[svc] || [svc.toUpperCase().slice(0, 4), 'gen'];
      const [l1, l2] = strs(t);
      nodes[id] = { x, y, bot: l2 ? 58 : l1 ? 44 : 26 };
      const fs = abbr.length > 3 ? 11 : 13;
      front += `<g class="an an-${cat}"><rect x="${x - 22}" y="${y - 22}" width="44" height="44" rx="9"/><text x="${x}" y="${y + 4.5}" text-anchor="middle" class="an-i" style="font-size:${fs}px">${esc(abbr)}</text>${l1 ? `<text x="${x}" y="${y + 38}" text-anchor="middle" class="an-l">${esc(l1)}</text>` : ''}${l2 ? `<text x="${x}" y="${y + 52}" text-anchor="middle" class="an-s">${esc(l2)}</text>` : ''}</g>`;
    } else if (cmd === 'edge' || cmd === 'arrow' || cmd === 'path') {
      // Đường nối vuông góc kiểu sơ đồ AWS: đi ngang / dọc, rẽ góc 90 độ
      const label = strs(t)[0];
      const f = flags(t);
      const dash = f.includes('dash'), both = f.includes('both');
      const color = opt(t, 'c');
      const route = opt(t, 'route'); // hvh | vhv | hv | vh (mặc định tự chọn)
      const cls = `ae${dash ? ' ds' : ''}${color ? ' ae-' + color : ''}`;
      let pts;
      if (cmd === 'arrow' || cmd === 'path') {
        const nums = t.slice(1).filter((x) => typeof x === 'string' && /^-?\d+(\.\d+)?$/.test(x)).map(Number);
        pts = [];
        for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
      } else {
        const A = nodes[t[1]], B = nodes[t[2]];
        if (!A || !B) throw new Error('arch: không có node ' + (A ? t[2] : t[1]));
        const P = 26, dx = B.x - A.x, dy = B.y - A.y;
        const r = route || (Math.abs(dy) < 4 ? 'h' : Math.abs(dx) < 4 ? 'v' : Math.abs(dx) >= Math.abs(dy) ? 'hvh' : 'vhv');
        const sx = Math.sign(dx) || 1, sy = Math.sign(dy) || 1;
        // đi xuống từ đáy node thì chừa chỗ cho nhãn dưới biểu tượng
        const outV = (N, s) => (s > 0 ? N.bot : P), inV = (N, s) => (s > 0 ? P : N.bot);
        if (r === 'h') pts = [[A.x + sx * P, A.y], [B.x - sx * P, A.y]];
        else if (r === 'v') pts = [[A.x, A.y + sy * outV(A, sy)], [A.x, B.y - sy * inV(B, sy)]];
        else if (r === 'hvh') { const mx = (A.x + B.x) / 2 + (+opt(t, 'off') || 0); pts = [[A.x + sx * P, A.y], [mx, A.y], [mx, B.y], [B.x - sx * P, B.y]]; }
        else if (r === 'vhv') { const my = (A.y + B.y) / 2 + (+opt(t, 'off') || 0); pts = [[A.x, A.y + sy * outV(A, sy)], [A.x, my], [B.x, my], [B.x, B.y - sy * inV(B, sy)]]; }
        else if (r === 'hv') pts = [[A.x + sx * P, A.y], [B.x, A.y], [B.x, B.y - sy * inV(B, sy)]];
        else if (r === 'vh') pts = [[A.x, A.y + sy * outV(A, sy)], [A.x, B.y], [B.x - sx * P, B.y]];
        else throw new Error('arch: route lạ ' + r);
      }
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
      mid += `<path d="${d}" class="${cls}" marker-end="url(#ar)"${both ? ' marker-start="url(#ar)"' : ''}/>`;
      if (label) {
        // nhãn đặt giữa đoạn dài nhất
        let best = 0, bi = 0;
        for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); if (l > best) { best = l; bi = i; } }
        const lx = (pts[bi][0] + pts[bi + 1][0]) / 2, ly = (pts[bi][1] + pts[bi + 1][1]) / 2;
        const w = Math.min(label.length * 6.4 + 10, 260);
        front += `<g class="ae-lb"><rect x="${(lx - w / 2).toFixed(1)}" y="${(ly - 9).toFixed(1)}" width="${w.toFixed(1)}" height="17" rx="4"/><text x="${lx.toFixed(1)}" y="${(ly + 3.5).toFixed(1)}" text-anchor="middle">${esc(label)}</text></g>`;
      }
    } else if (cmd === 'text') {
      const x = +t[1], y = +t[2];
      const f = flags(t);
      const anchor = opt(t, 'anchor') || 'start';
      const cls = ['at', f.includes('small') ? 'at-s' : '', f.includes('bold') ? 'at-b' : '', opt(t, 'c') ? 'at-' + opt(t, 'c') : ''].join(' ');
      front += `<text x="${x}" y="${y}" text-anchor="${anchor}" class="${cls}">${esc(strs(t)[0] || '')}</text>`;
    } else throw new Error('arch: lệnh lạ ' + l);
  }
  return `<figure class="dg arch"><svg viewBox="0 0 ${W} ${H}" style="min-width:${Math.min(W, 640)}px;max-width:${W}px" role="img" aria-label="${esc(a.caption || '')}">${back}${mid}${front}</svg>${a.caption ? `<figcaption>${a.caption}</figcaption>` : ''}</figure>`;
}

function render(html) {
  const keep = [];
  html = html.replace(/<pre((?:\s+\w+="[^"]*")*)\s*>([\s\S]*?)<\/pre>/g, (_, at, body) => {
    keep.push(codeBlock(attrs(at), body));
    return `\u0000${keep.length - 1}\u0000`;
  });
  html = html.replace(/<fig((?:\s+\w+="[^"]*")*)\s*>([\s\S]*?)<\/fig>/g, (_, at, body) => fig(attrs(at), body));
  html = html.replace(/<arch((?:\s+\w+="[^"]*")*)\s*>([\s\S]*?)<\/arch>/g, (_, at, body) => arch(attrs(at), body));
  html = html.replace(/<quiz((?:\s+\w+="[^"]*")*)\s*>([\s\S]*?)<\/quiz>/g, (_, at, body) => quiz(attrs(at), body));
  const toc = [];
  const used = new Set();
  html = html.replace(/<h2>([\s\S]*?)<\/h2>/g, (_, t) => {
    let id = slugify(t.replace(/<[^>]+>/g, ''));
    while (used.has(id)) id += '-';
    used.add(id);
    toc.push({ id, t: t.replace(/<[^>]+>/g, '') });
    return `<h2 id="${id}"><a href="#${id}" class="anchor" aria-hidden="true">#</a>${t}</h2>`;
  });
  html = html.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[+i]);
  return { html, toc };
}

function slugify(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><marker id="ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="mk"/></marker></defs></svg>`;

function sidebar(current) {
  return PHASES.map((p) => {
    const ls = LESSONS.filter((l) => l.phase === p.id);
    return `<div class="sb-phase"><div class="sb-ph" style="--pc:${p.color}"><span>Chặng ${p.id}</span> ${esc(p.name)}</div><ol>${ls
      .map((l) => `<li><a href="${l.slug}.html" data-slug="${l.slug}"${l.slug === current ? ' aria-current="page"' : ''}><i class="dot"></i><span class="no">${l.no}</span><span class="tx">${esc(l.title)}</span></a></li>`)
      .join('')}</ol></div>`;
  }).join('') + `<div class="sb-phase"><div class="sb-ph" style="--pc:#64748b"><span>Tra cứu</span></div><ol>${EXTRA.map((e) => `<li><a href="${e.slug}.html"${e.slug === current ? ' aria-current="page"' : ''}><i class="dot plain"></i><span class="tx">${esc(e.title)}</span></a></li>`).join('')}</ol></div>`;
}

function page({ title, desc, slug, body, toc = [], wide = false }) {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#00ADD8">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css">
<script src="theme.js"></script>
<script src="app.js" defer></script>
</head>
<body>
${DEFS}
<header class="top">
  <button class="menu" type="button" aria-label="Mở danh sách bài"><span></span><span></span><span></span></button>
  <a class="brand" href="index.html"><img src="favicon.svg" alt="" width="28" height="28">cho dân Frontend</a>
  <nav class="topnav"><a href="index.html#lo-trinh">Lộ trình</a><a href="thuat-ngu.html">Thuật ngữ</a><a href="nguyen-tac.html">Nguyên tắc BE</a></nav>
  <button class="theme" type="button" aria-label="Đổi giao diện sáng / tối"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" fill="currentColor"/></svg></button>
</header>
<div class="layout${wide ? ' wide' : ''}">
  <aside class="side" aria-label="Danh sách bài">
    <div class="prog"><div class="prog-t"><span>Tiến độ</span><b class="prog-n">0/${LESSONS.length}</b></div><div class="prog-b"><i></i></div></div>
    ${sidebar(slug)}
  </aside>
  <div class="scrim"></div>
  <main id="main">${body}</main>
  ${toc.length ? `<nav class="toc" aria-label="Trong bài này"><div class="toc-h">Trong bài này</div>${toc.map((t) => `<a href="#${t.id}">${esc(t.t)}</a>`).join('')}</nav>` : ''}
</div>
</body>
</html>`;
}

function lessonPage(l, i) {
  const file = path.join(SRC, 'lessons', l.slug + '.html');
  const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '<p>Bài này đang được viết.</p>';
  // {{n:slug}} → số thứ tự của bài đó (thêm / chèn bài không làm sai các chỗ nhắc "bài N")
  const { html, toc } = render(raw.replace(/\{\{n:([a-z0-9-]+)\}\}/g, (_, s) => {
    const k = LESSONS.findIndex((x) => x.slug === s);
    if (k < 0) throw new Error(`${l.slug}: không có bài ${s}`);
    return String(k);
  }));
  const p = PHASES.find((x) => x.id === l.phase);
  const prev = LESSONS[i - 1];
  const next = LESSONS[i + 1];
  const body = `<article class="lesson" data-slug="${l.slug}">
  <header class="l-head">
    <div class="l-meta"><span class="ph" style="--pc:${p.color}">Chặng ${p.id} · ${esc(p.name)}</span><span>Bài ${l.no}</span><span>${l.mins} phút đọc + làm bài</span></div>
    <h1>${esc(l.title)}</h1>
    <p class="lead">${esc(l.desc)}</p>
    ${l.goals ? `<div class="goals"><b>Học xong bài này bạn sẽ:</b><ul>${l.goals.map((g) => `<li>${g}</li>`).join('')}</ul></div>` : ''}
  </header>
  <div class="prose">${html}</div>
  <div class="done-box"><button class="done-btn" type="button" data-slug="${l.slug}">Đánh dấu đã học xong bài này</button></div>
  <nav class="pn">${prev ? `<a class="prev" href="${prev.slug}.html"><small>Bài trước</small>${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a class="next" href="${next.slug}.html"><small>Bài tiếp theo</small>${esc(next.title)}</a>` : '<a class="next" href="thuat-ngu.html"><small>Tra cứu</small>Từ điển thuật ngữ backend</a>'}</nav>
</article>`;
  return page({ title: `Bài ${l.no}: ${l.title} · ${SITE}`, desc: l.desc, slug: l.slug, body, toc });
}

function extraPage(e) {
  const file = path.join(SRC, 'pages', e.slug + '.html');
  const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '<p>Trang này đang được viết.</p>';
  const { html, toc } = render(raw);
  const body = `<article class="lesson"><header class="l-head"><div class="l-meta"><span class="ph" style="--pc:#64748b">Tra cứu</span></div><h1>${esc(e.title)}</h1><p class="lead">${esc(e.desc)}</p></header><div class="prose">${html}</div></article>`;
  return page({ title: `${e.title} · ${SITE}`, desc: e.desc, slug: e.slug, body, toc });
}

function indexPage() {
  const raw = fs.readFileSync(path.join(SRC, 'pages', 'index.html'), 'utf8');
  const cards = PHASES.map((p) => {
    const ls = LESSONS.filter((l) => l.phase === p.id);
    const mins = ls.reduce((t, l) => t + l.mins, 0);
    return `<section class="phase" style="--pc:${p.color}"><div class="phase-h"><span class="phase-no">${p.id}</span><div><h3>${esc(p.name)}</h3><p>${esc(p.desc)}</p><small>${ls.length} bài · khoảng ${mins < 60 ? mins + ' phút' : Math.round(mins / 60) + ' giờ'}</small></div></div><div class="cards">${ls
      .map((l) => `<a class="card" href="${l.slug}.html" data-slug="${l.slug}"><span class="card-no">Bài ${l.no}</span><b>${esc(l.title)}</b><p>${esc(l.desc)}</p><span class="card-done">Đã học</span></a>`)
      .join('')}</div></section>`;
  }).join('');
  const total = LESSONS.reduce((t, l) => t + l.mins, 0);
  const { html } = render(raw.replace('{{PHASES}}', cards).replace('{{COUNT}}', String(LESSONS.length)).replace('{{HOURS}}', String(Math.round(total / 60))));
  return page({ title: `${SITE}: lộ trình học backend Golang từ số 0`, desc: 'Lộ trình học backend bằng Go cho lập trình viên frontend: ngôn ngữ Go, HTTP, REST, SQL, cache, bảo mật, hàng đợi, triển khai và dự án thật.', slug: '', body: html, wide: true });
}

/* ---------------- Chạy ---------------- */
// Xoá các trang đã sinh lần trước (mọi file .html ở gốc repo đều do build tạo ra).
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.html')) fs.rmSync(path.join(OUT, f));
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
let n = 0;
LESSONS.forEach((l, i) => {
  l.no = String(i).padStart(2, '0');
});
LESSONS.forEach((l, i) => {
  fs.writeFileSync(path.join(OUT, l.slug + '.html'), lessonPage(l, i));
  n++;
});
for (const e of EXTRA) {
  fs.writeFileSync(path.join(OUT, e.slug + '.html'), extraPage(e));
  n++;
}
fs.writeFileSync(path.join(OUT, 'index.html'), indexPage());
fs.writeFileSync(path.join(OUT, '404.html'), page({ title: 'Không tìm thấy trang', desc: '', slug: '', body: '<article class="lesson"><h1>Không tìm thấy trang</h1><p class="lead">Trang này không có. <a href="index.html">Về lộ trình</a>.</p></article>' }));
for (const f of fs.readdirSync(path.join(SRC, 'static'))) fs.copyFileSync(path.join(SRC, 'static', f), path.join(OUT, f));
console.log(`Đã dựng ${n + 1} trang vào gốc repo`);
