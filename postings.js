'use strict';
/* ===== 求人管理 ===== */
function fixChip(p) {
  if (!p.nextFix || p.status === '停止') return '';
  const d = daysUntil(p.nextFix);
  const cls = d < 0 ? 'crit' : d <= 3 ? 'warn' : '';
  return `<span class="fxd ${cls}">${d < 0 ? `${-d}日超過` : d === 0 ? '今日修正' : `${fmtMD(p.nextFix)}修正`}</span>`;
}
function sparkSVG(byMonth) {
  const ms = (S.stats && S.stats.months) || []; if (!ms.length) return '';
  const vals = ms.map(m => byMonth[m] || 0); const max = Math.max(1, ...vals);
  const W = 22 * ms.length, Hh = 46;
  return `<svg class="spark" viewBox="0 0 ${W} ${Hh + 14}" width="${W}" height="${Hh + 14}" role="img" aria-label="月別応募数">${vals.map((v, i) => { const h = Math.round(v / max * Hh); return `<rect x="${i * 22 + 3}" y="${Hh - h}" width="16" height="${Math.max(h, v ? 2 : 0)}" fill="currentColor" opacity="${i === vals.length - 1 ? 1 : .55}" rx="1"></rect><text x="${i * 22 + 11}" y="${Hh + 11}" text-anchor="middle">${+ms[i].slice(5)}月</text>${v ? `<text x="${i * 22 + 11}" y="${Hh - h - 3}" text-anchor="middle">${v}</text>` : ''}`; }).join('')}</svg>`;
}
function viewPostings() {
  const C = cfg(), media = mediaCols(), pk = S.pk;
  const q = new URLSearchParams(location.hash.split('?')[1] || ''); if (q.get('case') && S.open !== q.get('case') && !S._openedFromQuery) { S.open = q.get('case'); S._openedFromQuery = true; }
  const idx = adIndex(); const sites = adSites(idx);
  const cases = Object.values(S.cases).map(normalizeCase).filter(c => !c.flow.closed && (!pk || c.kyoten === pk));
  const mk = mediaByKyoten(sites);
  const kyRows = [...new Set([...C.kyotens.map(k => k.id), ...Object.keys(mk)])].filter(k => mk[k] && (!pk || k === pk || (isUnk(k) && !pk)));
  const mTot = m => sum(kyRows.map(k => ((mk[k] || {})[m] || {}).n || 0));
  const liveManual = Object.values(S.postings).filter(p => p.status !== '停止' && S.cases[p.caseId] && (!pk || S.cases[p.caseId].kyoten === pk));
  const overdue = liveManual.filter(p => p.nextFix && daysUntil(p.nextFix) < 0).length;
  const soon = liveManual.filter(p => p.nextFix && daysUntil(p.nextFix) >= 0 && daysUntil(p.nextFix) <= 3).length;
  const docs = adDocs();
  const srcLine = docs.length ? docs.map(d => `${d.media}${d.kyoten ? '（' + d.kyoten + '）' : ''} ${d.period || fmtD(d.importedAt)}`).join('　') : '';
  // 媒体別の件数（取込データのある媒体は取込から、ない媒体は手入力の掲載から）
  const F0 = S.adf || (S.adf = { q: '', sort: 'n', media: '' });
  const inK = s => !pk || s.kyoten === pk;
  const mRows = media.map(m => {
    if (adLoaded(m)) {
      const o = zeroM(); let sc = 0;
      sites.filter(inK).forEach(s => { const x = s.media[m]; if (!x) return; for (const k of METRICS) o[k] += x[k] || 0; if (x.n) sc++; });
      if (m === '求人BOX') docs.filter(d => d.media === m).forEach(d => Object.entries(d.unmatched || {}).forEach(([k, u]) => { if (!pk || k === pk) o.n += u.n; }));
      const ds = docs.filter(d => d.media === m);
      return { m, ...o, sites: sc, src: ds.map(d => `${d.kyoten ? d.kyoten + '・' : ''}${d.period || ''}（${fmtMD(d.importedAt)}取込）`).join('／'), manual: false };
    }
    const ps = liveManual.filter(p => p.media === m); if (!ps.length) return null;
    return { m, n: sum(ps.map(p => p.count)), hold: 0, sites: new Set(ps.map(p => p.caseId)).size, imp: sum(ps.map(p => p.imp)), click: sum(ps.map(p => p.click)), apply: sum(ps.map(p => p.apply)), cost: 0, src: '手入力の掲載', manual: true };
  }).filter(Boolean);
  const mt = zeroM(); mRows.forEach(r => { for (const k of METRICS) mt[k] += r[k] || 0; }); mt.sites = '';
  const numTd = (v, b) => `<td class="n" style="text-align:right${b ? ';font-weight:700' : ''}">${v}</td>`;
  const mRow = (r, total) => `<tr${total ? ' class="grp"' : ` class="click${F0.media === r.m ? ' open' : ''}" data-act="adm" data-v="${esc(r.m)}" title="この媒体の案件一覧を見る"`}><td>${total ? '合計' : `<b>${esc(r.m)}</b>`}</td>${numTd(`<span style="font-size:16px">${r.n.toLocaleString()}</span>件`, true)}${numTd(total ? '' : r.sites ? r.sites + '案件' : '—')}${numTd(r.hold ? r.hold.toLocaleString() + '件' : '—')}${numTd(r.imp ? r.imp.toLocaleString() : '—')}${numTd(r.click ? r.click.toLocaleString() : '—')}${numTd(r.imp ? pct(r.click / r.imp) : '—')}${numTd(r.apply || '—', true)}${numTd(r.apply && r.cost ? yen(r.cost / r.apply) : '—')}${numTd(r.cost ? yen(r.cost) : '—')}<td class="small muted">${total ? '' : esc(r.src)}</td></tr>`;
  const tiles = `<h2 style="font-size:15px;margin:0 0 8px">媒体別の件数${pk ? `（${esc(pk)}）` : ''}</h2>
    ${mRows.length ? `<div class="scroll-x"><table class="list"><thead><tr><th>媒体</th><th style="text-align:right">公開中の求人</th><th style="text-align:right">案件数</th><th style="text-align:right">掲載保留</th><th style="text-align:right">表示</th><th style="text-align:right">クリック</th><th style="text-align:right">CTR</th><th style="text-align:right">応募</th><th style="text-align:right">応募単価</th><th style="text-align:right">費用</th><th>データ</th></tr></thead><tbody>${mRows.map(r => mRow(r)).join('')}${mRows.length > 1 ? mRow(mt, true) : ''}</tbody></table></div>
    <p class="small muted">媒体の行を押すと、その媒体に出ている案件の一覧に切り替わります。表示・応募・費用は各CSVの集計期間の合計です。</p>` : `<div class="banner info">まだ件数がありません。<a href="#/ads">求人広告CSVを取り込む</a>か、案件の行を開いて掲載を手入力してください。</div>`}
    ${overdue || soon ? `<div class="row" style="margin:0 0 18px">${overdue ? chip(`手入力の掲載：修正日を超過 ${overdue}件`, 'crit') : ''}${soon ? chip(`3日以内に修正 ${soon}件`, 'warn') : ''}</div>` : '<div style="height:10px"></div>'}`;
  const shownMedia = media.filter(m => kyRows.some(k => (mk[k] || {})[m]));
  const matrix = kyRows.length ? `<div class="scroll-x"><table class="list"><thead><tr><th>拠点</th>${shownMedia.map(m => `<th style="text-align:right">${esc(m)}</th>`).join('')}<th style="text-align:right">合計</th></tr></thead><tbody>${kyRows.map(k => `<tr><td>${esc(k)}</td>${shownMedia.map(m => { const c = (mk[k] || {})[m]; return `<td class="n" style="text-align:right">${c && c.n ? `<b>${c.n.toLocaleString()}</b>件<div class="small muted">${c.sites}案件${c.hold ? `・保留${c.hold}` : ''}${c.manual ? '・手入力' : ''}</div>` : '<span class="muted">—</span>'}</td>`; }).join('')}<td class="n" style="text-align:right;font-weight:700">${sum(shownMedia.map(m => ((mk[k] || {})[m] || {}).n || 0)).toLocaleString()}</td></tr>`).join('')}</tbody></table></div>` : '';
  // 案件別×媒体（取込データ）
  const F = F0; const fm = AD_MEDIA.includes(F.media) ? F.media : '';
  const sq = norm(F.q);
  const caseList = Object.values(S.cases).map(normalizeCase);
  const siteRows = sites.filter(s => (!pk || s.kyoten === pk) && (!sq || norm(s.name + s.codes.join(' ')).includes(sq)) && (!fm || (s.media[fm] && s.media[fm].n)))
    .map(s => { const all = zeroM(); (fm ? [s.media[fm]] : Object.values(s.media)).forEach(x => { for (const k of METRICS) all[k] += x[k] || 0; }); return { s, all, cs: caseList.filter(c => s.groups.some(g => matchCaseAd(c, g))) }; })
    .sort((a, b) => F.sort === 'apply' ? b.all.apply - a.all.apply : F.sort === 'cost' ? b.all.cost - a.all.cost : b.all.n - a.all.n);
  const siteTable = sites.length ? `<section class="sites" id="sites"><div class="row" style="margin:26px 0 8px"><h2 style="font-size:15px">${fm ? `${esc(fm)}に出ている案件（${siteRows.length}案件）` : '案件別・媒体別の求人数'}</h2><span class="small muted">${esc(srcLine)}</span><span class="spacer"></span>
      <div class="seg-f" role="group" aria-label="媒体">${[['', '全媒体'], ...AD_MEDIA.filter(adLoaded).map(m => [m, m])].map(([k, l]) => `<button data-act="adm" data-v="${esc(k)}" aria-pressed="${fm === k}">${esc(l)}</button>`).join('')}</div>
      <input class="inp" style="width:200px" type="search" data-adf="q" value="${esc(F.q)}" placeholder="案件名・番号で検索" aria-label="案件を検索">
      <div class="seg-f" role="group" aria-label="並び順">${[['n', '求人数'], ['apply', '応募'], ['cost', '費用']].map(([k, l]) => `<button data-act="adsort" data-v="${k}" aria-pressed="${F.sort === k}">${l}順</button>`).join('')}</div></div>
    <div class="scroll-x"><table class="list"><thead><tr><th>拠点</th><th>案件</th>${AD_MEDIA.map(m => `<th style="text-align:right">${m}</th>`).join('')}<th style="text-align:right">表示</th><th style="text-align:right">クリック</th><th style="text-align:right">CTR</th><th style="text-align:right">応募</th><th style="text-align:right">費用</th><th style="text-align:right">応募単価</th><th>台帳</th></tr></thead><tbody>
    ${siteRows.slice(0, 120).map(({ s, all, cs }) => `<tr><td class="small">${esc(s.kyoten)}</td><td><div class="cname" style="font-size:13px">${esc(s.name)}</div>${s.codes.length ? `<div class="cmeta">番号 ${s.codes.slice(0, 8).map(esc).join('・')}${s.codes.length > 8 ? '…' : ''}</div>` : ''}</td>
      ${AD_MEDIA.map(m => { const x = s.media[m]; return `<td class="n" style="text-align:right">${x && (x.n || x.hold) ? `<b>${x.n}</b>${x.hold ? `<div class="small muted">保留${x.hold}</div>` : ''}` : '<span class="muted">—</span>'}</td>`; }).join('')}
      <td class="n" style="text-align:right">${all.imp.toLocaleString()}</td><td class="n" style="text-align:right">${all.click.toLocaleString()}</td><td class="n small" style="text-align:right">${all.imp ? pct(all.click / all.imp) : ''}</td><td class="n" style="text-align:right;font-weight:700">${all.apply || '—'}</td><td class="n" style="text-align:right">${all.cost ? yen(all.cost) : '—'}</td><td class="n small" style="text-align:right">${all.apply ? yen(all.cost / all.apply) : ''}</td>
      <td class="small">${cs.length ? cs.map(c => `<a href="#/case/${c.id}">${esc(caseName(c))}</a>`).join('<br>') : `<a class="btn sm" href="#/new?name=${encodeURIComponent(s.named ? s.name : '')}&kyoten=${encodeURIComponent(isUnk(s.kyoten) ? '' : s.kyoten)}&code=${encodeURIComponent(s.codes.join(','))}">登録</a>`}</td></tr>`).join('')}
    </tbody></table></div>${siteRows.length > 120 ? `<p class="small muted">ほか${siteRows.length - 120}件。検索で絞り込んでください。</p>` : ''}
    <p class="small muted">同じ現場の求人は1行にまとめています（例：Indeedの「日立建機龍ヶ崎フォークリフト」は求人ボックスのラベル「日立建機龍ヶ崎」の行へ）。表示・応募・費用は各CSVの集計期間の合計です。</p></section>` : '';
  // 台帳の案件ボード
  const byK = {}; cases.forEach(c => (byK[c.kyoten || '拠点未設定'] = byK[c.kyoten || '拠点未設定'] || []).push(c));
  const cols = 5 + media.length;
  const cellFor = (c, m, groups, ps) => {
    const mp = ps.filter(p => p.media === m);
    if (adLoaded(m)) { const x = adSum(groups, m); return `<td class="m">${x.n ? `<span class="cnt">${x.n}</span>` : '<span class="muted">—</span>'}${mp.length ? `<span class="fx small muted" title="手入力の掲載は取込データがある媒体では数えません">手入力あり</span>` : ''}</td>`; }
    if (!mp.length) return `<td class="m muted">—</td>`;
    const n = sum(mp.filter(p => p.status !== '停止').map(p => p.count)); const u = mp.find(p => p.url); const worst = mp.filter(p => p.nextFix && p.status !== '停止').sort((a, b) => a.nextFix.localeCompare(b.nextFix))[0];
    return `<td class="m"><span class="cnt">${n}</span>${u ? `<a href="${esc(u.url)}" target="_blank" rel="noopener" title="求人を開く">↗</a>` : ''}${worst ? fixChip(worst) : ''}</td>`;
  };
  const body = Object.entries(byK).map(([k, cs]) => `<tr class="grp"><td colspan="${cols}">${esc(k)}　${cs.length}案件</td></tr>` + cs.map(c => ({ c, groups: adGroupsFor(c, idx), ps: postingsOf(c.id) })).map(x => ({ ...x, tot: sum(media.map(m => adLoaded(m) ? adSum(x.groups, m).n : sum(x.ps.filter(p => p.media === m && p.status !== '停止').map(p => p.count)))) })).sort((a, b) => b.tot - a.tot).map(({ c, groups, ps, tot }) => {
    const st = statsFor(c); const open = S.open === c.id; const stg = stage(c);
    return `<tr class="click${open ? ' open' : ''}" data-act="openp" data-id="${c.id}"><td><div class="cname">${esc(caseName(c))}</div><div class="cmeta">${chip(stg.label, stg.tone)} ${c.pendingRd ? chip('変更未確認', 'info') : ''}</div></td>${media.map(m => cellFor(c, m, groups, ps)).join('')}<td class="n" style="text-align:right;font-weight:700">${tot || '—'}</td><td class="n" style="text-align:right">${st.recent || '—'}</td><td class="n" style="text-align:right">${st.nyusha || '—'}</td><td>${chip(c.flow.rd.state, c.flow.rd.state === '掲載中' ? 'ok' : c.flow.rd.state === '未着手' && c.flow.area1.done ? 'warn' : '')}</td></tr>${open ? `<tr class="detail"><td colspan="${cols}">${postingDetail(c, groups)}</td></tr>` : ''}`;
  }).join('')).join('');
  const unreg = unregisteredNames();
  return `<div class="pagehead"><div><div class="eyebrow">JOB POSTINGS</div><h1>求人管理</h1></div><span class="sub">どの拠点で・どの案件が・どの媒体に何件出ているか</span><span class="spacer"></span>
    <a class="btn primary" href="#/ads">求人広告CSVを取り込む</a>
    <div class="seg-f" role="group" aria-label="拠点"><button data-act="pk" data-v="" aria-pressed="${!pk}">全拠点</button>${C.kyotens.map(k => `<button data-act="pk" data-v="${esc(k.id)}" aria-pressed="${pk === k.id}">${esc(k.id)}</button>`).join('')}</div></div>
    ${!docs.length ? `<div class="banner info">Indeedや求人ボックスのCSVを取り込むと、媒体別の求人数と実績が自動で入ります。<a href="#/ads">取り込む</a></div>` : ''}
    ${tiles}
    ${matrix ? `<h2 style="font-size:15px;margin:0 0 8px">拠点×媒体の求人数</h2>${matrix}<p class="small muted">「○案件」は同じ現場をまとめた数。${adDocs().some(d => d.media === '求人BOX' && Object.keys(d.byKyoten || {}).some(isUnk)) ? '求人ボックスの「（未区分）」は勤務先名・電話番号・同名のIndeed案件のどれでも拠点が決まらなかった求人です（取込画面で拠点を付けられます）。' : ''}</p>` : ''}
    ${siteTable}
    <h2 style="font-size:15px;margin:26px 0 8px">台帳の案件</h2>
    <div class="scroll-x"><table class="list board"><thead><tr><th>案件</th>${media.map(m => `<th style="text-align:center">${esc(m)}</th>`).join('')}<th style="text-align:right">合計</th><th style="text-align:right">応募 直近3ヶ月</th><th style="text-align:right">入社 累計</th><th>RD</th></tr></thead><tbody>${body || `<tr><td colspan="${cols}" class="empty">案件がありません</td></tr>`}</tbody></table></div>
    <p class="small muted">行を押すと掲載の登録・修正日・応募実績・AI診断を開きます。取込データのある媒体（${AD_MEDIA.filter(adLoaded).join('・') || 'なし'}）は、案件名・案件番号・住所で台帳の案件に自動で紐づけています。応募実績は${S.stats ? `応募シート（${esc(S.stats.source || '')}・${fmtD(S.stats.importedAt)}取込）` : '応募シート未取込'}から。</p>
    ${unreg.length ? `<section class="unreg"><h2>応募シートにあるが、台帳にない案件名（直近3ヶ月の応募順）</h2><p class="small muted" style="margin:0 0 8px">同じ案件でも名前の書き方が揃っていないと別案件として数えられます。台帳に登録するか、既存案件の「応募シートでの名称」に追加してください。</p>
      <div class="scroll-x"><table class="list"><thead><tr><th>応募シート上の名称</th><th>拠点</th><th style="text-align:right">直近3ヶ月</th><th style="text-align:right">累計</th><th style="text-align:right">入社</th><th></th></tr></thead><tbody>${unreg.slice(0, 15).map(u => `<tr><td>${esc(u.name)}</td><td class="small">${esc(u.kyoten)}</td><td class="n" style="text-align:right">${u.recent}</td><td class="n" style="text-align:right">${u.total}</td><td class="n" style="text-align:right">${u.nyusha || '—'}</td><td style="text-align:right"><a class="btn sm" href="#/new?name=${encodeURIComponent(u.name)}&kyoten=${encodeURIComponent(u.kyoten)}">案件として登録</a></td></tr>`).join('')}</tbody></table></div>${unreg.length > 15 ? `<p class="small muted">ほか${unreg.length - 15}件</p>` : ''}</section>` : ''}`;
}
function postingDetail(c, groups = adGroupsFor(c)) {
  const C = cfg(), ps = postingsOf(c.id).sort((a, b) => String(a.media).localeCompare(String(b.media)));
  const st = statsFor(c); const p0 = c.positions[0];
  const rowP = p => `<tr data-post="${p.id}">
    <td><select data-k="media">${C.media.map(m => `<option${m === p.media ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select></td>
    <td style="width:62px"><input class="n" type="number" data-k="count" value="${esc(p.count)}" aria-label="件数"></td>
    <td><input type="url" data-k="url" value="${esc(p.url || '')}" placeholder="https://" aria-label="URL"></td>
    <td style="width:128px"><input type="date" data-k="start" value="${esc(p.start || '')}" aria-label="掲載開始"></td>
    <td style="width:128px"><input type="date" data-k="nextFix" value="${esc(p.nextFix || '')}" aria-label="次回修正日"></td>
    <td style="width:80px"><select data-k="status">${['掲載中', '停止'].map(x => `<option${x === (p.status || '掲載中') ? ' selected' : ''}>${x}</option>`).join('')}</select></td>
    <td style="width:66px"><input class="n" type="number" data-k="imp" value="${esc(p.imp || '')}" aria-label="表示"></td>
    <td style="width:60px"><input class="n" type="number" data-k="click" value="${esc(p.click || '')}" aria-label="クリック"></td>
    <td style="width:54px"><input class="n" type="number" data-k="apply" value="${esc(p.apply || '')}" aria-label="応募"></td>
    <td class="small n">${+p.imp && +p.click ? pct(p.click / p.imp) : ''}</td>
    <td style="white-space:nowrap"><button class="btn sm" data-act="fixed" data-id="${p.id}" title="今日修正した（次回修正日を${C.fixDays}日後に）">修正した</button> <button class="btn sm ghost" data-act="delpost" data-id="${p.id}" aria-label="削除">×</button></td></tr>`;
  const funnel = [['応募', st.total], ['面接実施', st.interviewed], ['提案', st.proposed], ['見学', st.kengaku], ['入社', st.nyusha]];
  const mediaRows = Object.entries(st.byMedia).sort((a, b) => b[1] - a[1]); const mmax = Math.max(1, ...mediaRows.map(x => x[1]));
  const rv = c.aiReview;
  return `<div class="pgrid">
    <div class="panel">${adDetailHTML(c, groups)}<h4>掲載（手入力）</h4>
      <div class="scroll-x"><table class="ptab"><thead><tr><th>媒体</th><th>件数</th><th>URL</th><th>掲載開始</th><th>次回修正</th><th>状態</th><th>表示</th><th>クリック</th><th>応募</th><th>CTR</th><th></th></tr></thead><tbody>${ps.map(rowP).join('') || `<tr><td colspan="11" class="muted small" style="padding:10px 4px">まだ登録がありません</td></tr>`}</tbody></table></div>
      <div class="row" style="margin-top:8px"><button class="btn sm" data-act="addpost" data-id="${c.id}">＋ 媒体を追加</button><span class="small muted">入力は欄を離れると保存されます</span></div>
      <div class="fg" style="margin-top:14px">
        <div class="f"><label>RDの作業状況</label><select class="inp" data-case="${c.id}" data-ck="flow.rd.state">${OPT.rd.map(x => `<option${x === c.flow.rd.state ? ' selected' : ''}>${x}</option>`).join('')}</select></div>
        <div class="f"><label>RD担当</label><select class="inp" data-case="${c.id}" data-ck="flow.rd.tanto"><option value="">—</option>${C.staff.map(x => `<option${x === c.flow.rd.tanto ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
        <div class="f"><label>エリアの相場時給</label><div class="suffix"><input class="inp" type="number" data-case="${c.id}" data-ck="market.wage" value="${esc(c.market.wage)}" placeholder="競合の時給"><span>円</span></div></div>
        <div class="f w2"><label>相場のメモ</label><input class="inp" type="text" data-case="${c.id}" data-ck="market.note" value="${esc(c.market.note)}" placeholder="例：近隣の同職種 1,350〜1,500円"></div>
      </div>
      ${c.pendingRd ? `<div class="banner info" style="margin:12px 0 0">営業が案件の内容を変更しました。<a href="#/case/${c.id}/log">変更履歴</a>を確認して求人に反映してください。<button class="btn sm" data-act="rdack" data-id="${c.id}">確認した</button></div>` : ''}
      <div class="row" style="margin-top:12px"><a class="btn sm" href="#/doc/${c.id}/ad">簡易求人票</a><a class="btn sm" href="#/case/${c.id}">案件を開く</a><span class="small muted">時給 ${yen(p0.pay) || '—'} ・ ${esc(p0.shiftType)} ・ ${p0.ageMax ? p0.ageMax + '歳まで' : '年齢上限なし'} ・ ${interviewOK(c) ? '面接可' : '面接停止（③未入力）'}</span></div>
    </div>
    <div class="panel"><h4>応募実績（応募シートより）</h4>
      ${st.total ? `<div class="funnel">${funnel.map(([k, v], i) => `<div><div class="k">${k}</div><div class="v">${v}</div><div class="p">${i ? pct(st.total ? v / st.total : null) : `年齢NG ${st.ageNG}`}</div></div>`).join('')}</div>
      <div class="row" style="align-items:flex-end;gap:18px"><div class="bars" style="flex:1;min-width:200px">${mediaRows.slice(0, 6).map(([m, v]) => `<div class="b"><span>${esc(m)}</span><i style="width:${v / mmax * 100}%"></i><span>${v}</span></div>`).join('')}</div>${sparkSVG(st.byMonth)}</div>
      <p class="small muted" style="margin:8px 0 0">照合した名称：${st.names.slice(0, 6).map(esc).join('、')}${st.names.length > 6 ? ` ほか${st.names.length - 6}` : ''}</p>` : `<p class="small muted">一致する応募がありません。<a href="#/case/${c.id}/log">応募シートでの名称</a>を設定してください。</p>`}
      ${rv ? `<div class="ai"><h4 style="margin:0">AI求人診断（Claude版で実施した結果）</h4>${aiReviewHTML(rv)}</div>` : ''}
    </div></div>`;
}
function aiReviewHTML(rv) {
  const r = rv.result || {}; const tone = { '要改善': 'crit', '要注意': 'warn', '良好': 'ok' }[r.verdict] || '';
  const pr = { '高': 'crit', '中': 'warn', '低': '' };
  return `<div class="row" style="margin:8px 0">${chip(r.verdict || '診断結果', tone)}<span class="small muted">${fmtDT(rv.at)} ${esc(rv.by)}</span></div>
    <p style="margin:0 0 8px;font-size:13px">${esc(r.summary || '')}</p>
    ${(r.issues || []).map(i => `<div class="issue">${chip(i.priority || '', pr[i.priority] || '')}<div><p class="fd"><b>${esc(i.area || '')}</b>　${esc(i.finding || '')}</p><p class="act">→ ${esc(i.action || '')}</p></div></div>`).join('')}
    ${(r.conditionChanges || []).length ? `<p class="small" style="margin:10px 0 4px"><b>条件変更案</b></p><table class="ptab">${r.conditionChanges.map(x => `<tr><td>${esc(x.item)}</td><td class="muted">${esc(x.now)}</td><td>→ <b>${esc(x.proposal)}</b></td><td class="small muted">${esc(x.reason)}</td></tr>`).join('')}</table>` : ''}
    ${r.adTitle ? `<p class="small" style="margin:10px 0 0"><b>タイトル案</b>　${esc(r.adTitle)}</p>` : ''}`;
}

/* ===== AI ===== */
function caseBrief(c) {
  const st = statsFor(c); const g = gate(c);
  return {
    案件: caseName(c), 拠点: c.kyoten, 住所: c.company.address, アクセス: c.company.access, 企業説明: c.company.description,
    職種: c.positions.map(p => ({ 職種: p.name, 勤務形態: p.shiftType, 時給: +p.pay || null, 原価率: rate(p) != null ? pct(rate(p)) : '不明', 一般賃金との差: (w => w.ok == null ? '不明' : Math.round(w.diff) + '円')(wageCheck(c, p)), 月収例: monthly(p).total || null, 年齢: `${p.ageMin || ''}〜${p.ageMax || '上限なし'}`, 性別: p.sex, 勤務時間: p.shifts.filter(s => s.start).map(s => `${s.label} ${shiftText(s)} 休憩${s.breakMin}分`), 仕事内容: detailText(p), 資格: p.qualification, 作業姿勢: p.posture, 残業月: p.overtimeH, 募集人数: p.headcount })),
    職場の特徴: meritLines(c),
    休日: c.work.holidays, 年間休日: c.hearing.annualHolidays, 職場環境: c.hearing.environment, 設備: c.facilities.checks,
    現場実態: Object.fromEntries(KENGAKU.filter(q => filled(c.kengaku[q[1]])).map(q => [q[2], c.kengaku[q[1]] + (c.kengaku[q[1] + '_n'] ? '（' + c.kengaku[q[1] + '_n'] + '）' : '')])),
    エリア相場時給: c.market.wage || '未入力', 相場メモ: c.market.note,
    原価率しきい値: cfg().threshold + '%', 原価率最大: g.max != null ? pct(g.max) : '不明',
    掲載: postingsOf(c.id).map(p => ({ 媒体: p.media, 件数: p.count, 状態: p.status, 掲載日数: p.start ? daysSince(p.start) : '不明', 表示: p.imp || null, クリック: p.click || null, 応募: p.apply || null, CTR: +p.imp && +p.click ? pct(p.click / p.imp) : null })),
    求人広告の取込実績: adGroupsFor(c).map(g => ({ 媒体: Object.keys(g.media)[0], 案件: g.name, 番号: g.code || '', ...(x => ({ 件数: x.n, 表示: x.imp, クリック: x.click, CTR: x.imp ? pct(x.click / x.imp) : null, 応募: x.apply, 費用: x.cost }))(Object.values(g.media)[0]) })).slice(0, 30),
    応募シート実績: { 応募: st.total, 年齢NG: st.ageNG, 面接実施: st.interviewed, 提案: st.proposed, 見学: st.kengaku, 入社: st.nyusha, 媒体別: st.byMedia, 月別: st.byMonth },
  };
}
const AI_ERR = e => ({ not_granted: 'AIの利用が許可されていません', sampling_disabled: 'このアカウントではAIを利用できません', rate_limited: 'AIの利用が混み合っています。少し待ってから押してください', invalid_json: 'AIの回答を読み取れませんでした。もう一度押してください', refused: 'AIがこの内容への回答を控えました' }[e && e.code] || 'AIに接続できませんでした（' + (e && e.code || 'error') + '）');
async function aiReview(id) {
  const box = $('#ai-' + id); const c = normalizeCase(S.cases[id]);
  const sample = window.claude && window.claude.use ? await window.claude.use('sample') : null;
  if (!sample) { box.innerHTML = '<p class="small muted">この表示ではAIを利用できません。</p>'; return; }
  box.innerHTML = '<p class="small muted">診断しています…（30秒ほどかかります）</p>';
  const prompt = `あなたは製造業・工場系の人材派遣会社で、求人広告の効果を厳しく評価するアドバイザーです。
以下の案件データを読み、応募が集まり、面接・入社まで進むために「労働条件」と「求人原稿」をどう変えるべきかを、遠慮せず具体的に指摘してください。
- 根拠はデータの数字で示す。データにないことは「推測」と明記する
- 時給を上げる提案は、原価率がしきい値を超えない範囲かどうかにも触れる
- 年齢NGが多い場合は、年齢条件の書き方・媒体の選び方にも触れる
- 掲載日数が長く応募が少ない場合は、原稿の修正点を具体的に
出力はJSONのみ。形式：
{"verdict":"要改善|要注意|良好","summary":"2文以内","issues":[{"area":"時給|勤務形態|仕事内容|年齢条件|掲載・媒体|原稿|職場環境|その他","finding":"何が問題か（数字つき）","action":"何をどう変えるか","priority":"高|中|低"}],"conditionChanges":[{"item":"項目","now":"現状","proposal":"変更案","reason":"理由"}],"adTitle":"改善後の求人タイトル案（30字以内）"}
issuesは重要な順に最大6件。

案件データ：
${JSON.stringify(caseBrief(c)).slice(0, 12000)}`;
  try {
    const result = await sample.json(prompt, { cache: false });
    await mutate(id, x => { x.aiReview = { at: nowISO(), by: S.me, result }; }, 'AI求人診断を実行', true);
  } catch (e) { box.innerHTML = `<p class="small" style="color:var(--crit)">${esc(AI_ERR(e))}</p>`; }
}
async function aiJobAd(id) {
  const out = $('#aiadout'); const c = normalizeCase(S.cases[id]);
  const sample = window.claude && window.claude.use ? await window.claude.use('sample') : null;
  if (!sample) { toast('この表示ではAIを利用できません', 'warn'); return; }
  out.innerHTML = `<div class="panel" style="padding:14px 16px;margin-bottom:16px"><div class="eyebrow">AIが作成中</div><div class="adtext" id="aiadtext" style="margin-top:8px">考えています…</div></div>`;
  const prompt = `工場・製造業の派遣求人（Airワーク・求人ボックス向け）の求人原稿を日本語で作ってください。
- 入力データにない条件（時給・手当・休日・待遇）は絶対に作らない。書けない項目は省く
- 仕事内容は、未経験者が1日の流れを想像できるように具体的に
- 職場環境・現場実態のうち応募の後押しになる事実を使う。マイナス情報は正直に、ただし対策と一緒に書く
- 見出しは【タイトル】【キャッチコピー】【仕事内容】【給与】【勤務時間】【休日】【勤務地・アクセス】【応募資格】【待遇・福利厚生】【職場の雰囲気】の順
- タイトルは30字以内、キャッチコピーは50字以内

データ：
${JSON.stringify(caseBrief(c)).slice(0, 12000)}`;
  try {
    const { text } = await sample(prompt, { cache: false, onText: ({ text }) => { const el = $('#aiadtext'); if (el) el.textContent = text; } });
    await mutate(id, x => { x.jobAd = { text, at: nowISO(), by: S.me }; }, 'AIで求人原稿を作成', true);
    toast('求人原稿を保存しました');
  } catch (e) { out.innerHTML = `<div class="banner warn">${esc(AI_ERR(e))}</div>`; }
}

/* ===== 設定 ===== */
function viewSettings() {
  const C = cfg(), st = S.stats;
  const ta = (id, v, rows = 6) => `<textarea id="${id}" rows="${rows}">${esc(v)}</textarea>`;
  return `<div class="pagehead"><div><div class="eyebrow">SETTINGS</div><h1>設定</h1></div><span class="sub">全員に共通の設定です</span><span class="spacer"></span><button class="btn primary" data-act="savecfg">設定を保存</button></div>
  <div class="sgrid">
    <div class="panel"><h3>拠点</h3><p>1行に1拠点：拠点ID｜会社名｜営業所｜所在地｜TEL｜FAX。勤務説明書の「管轄営業所」、稟議書の「企業名・営業所」に使います。</p>${ta('c-kyo', C.kyotens.map(k => [k.id, k.corp, k.office, k.address, k.tel, k.fax].join('｜')).join('\n'))}</div>
    <div class="panel"><h3>担当者</h3><p>1行に1人。営業担当・RD担当・入力者の選択肢になります。</p>${ta('c-staff', C.staff.join('\n'))}</div>
    <div class="panel"><h3>求人媒体</h3><p>1行に1媒体。求人管理の列になります。</p>${ta('c-media', C.media.join('\n'))}</div>
    <div class="panel"><h3>稟議の承認者</h3><p>1行に1つ：役割｜名前。全員が承認すると決裁になります。稟議書の押印欄の並びにも使います。</p>${ta('c-appr', C.approvers.map(a => `${a.role}｜${a.name}`).join('\n'), 4)}</div>
    <div class="panel"><h3>ルール</h3><p>原価率＝支払単価÷請求単価（稟議書の原価率と同じ式）。</p>
      <div class="fg"><div class="f"><label for="c-th">原価率しきい値</label><div class="suffix"><input class="inp" id="c-th" type="number" value="${C.threshold}"><span>%</span></div><small>以下なら稟議前に求人発注可</small></div>
      <div class="f"><label for="c-fix">求人の修正間隔</label><div class="suffix"><input class="inp" id="c-fix" type="number" value="${C.fixDays}"><span>日</span></div></div>
      <div class="f"><label for="c-rd">稟議の遅れ警告</label><div class="suffix"><input class="inp" id="c-rd" type="number" value="${C.ringiDays}"><span>日</span></div></div></div></div>
    <div class="panel"><h3>勤務説明書の定型文</h3><p>入社時必要品・保険・注意事項（1行に1つ）。</p>${ta('c-hitsuyo', C.fixed.hitsuyo, 3)}${ta('c-hoken', C.fixed.hoken, 4)}${ta('c-notes', C.fixed.notes.join('\n'), 6)}</div>
    <div class="panel"><h3>応募シートの取込</h3><p>拠点シート（CSV・Shift_JIS）を選ぶと、案件ごとの応募・面接・入社の実績を更新します。応募者の氏名・年齢などの個人情報は保存せず、案件名ごとの件数だけを保存します。同じ拠点の古い集計は置き換えます。</p>
      <input type="file" id="csvin" accept=".csv,text/csv">
      <p class="small" style="margin-top:10px">${st ? `現在：${esc(st.source || '')}（${fmtDT(st.importedAt)}取込）・${Object.keys(st.byName || {}).length}件の案件名・${(st.months || [])[0] || ''}〜${(st.months || []).slice(-1)[0] || ''}` : 'まだ取り込まれていません'}</p></div>
    <div class="panel"><h3>バックアップ</h3><p>全案件・掲載・取り込んだ求人広告・設定・応募集計をJSONで保存します。月1回程度の保存をおすすめします。</p><button class="btn" data-act="backup">JSONで保存</button></div>
  </div>`;
}
function parseCSV(t) {
  const re = /(?:"((?:[^"]|"")*)"|([^",\r\n]*))(,|\r?\n|$)/y; const rows = []; let row = [];
  while (re.lastIndex < t.length) {
    const m = re.exec(t); if (!m) break;
    row.push(m[1] !== undefined ? m[1].replace(/""/g, '"') : m[2]);
    if (m[3] !== ',') { rows.push(row); row = []; if (m[3] === '') break; }
  }
  if (row.length) rows.push(row);
  return rows;
}
async function importCsv(file) {
  const buf = await file.arrayBuffer();
  let text = ''; try { text = new TextDecoder('shift_jis').decode(buf); } catch { }
  if (!text.includes('希望勤務先名')) text = new TextDecoder().decode(buf);
  const rows = parseCSV(text); const hi = rows.findIndex(r => r.some(x => String(x).replace(/\s|　/g, '') === '希望勤務先名'));
  if (hi < 0) return toast('「希望勤務先名」の列が見つかりません。拠点シートのCSVを選んでください', 'warn');
  const head = rows[hi].map(h => String(h).replace(/\s|　/g, '')); const col = n => head.indexOf(n);
  const C = { kyoten: col('拠点'), month: col('応募月'), name: col('希望勤務先名'), media: col('応募媒体'), mensetsu: col('面接ステータス'), teian: col('提案ステータス'), kengaku: col('見学ステータス'), nyusha: col('入社日'), flag: col('計算フラグ') };
  const by = {}; const months = new Set(); const kyos = new Set();
  for (const r of rows.slice(hi + 1)) {
    const name = String(r[C.name] || '').trim(); const ky = String(r[C.kyoten] || '').trim(); if (!name || !ky) continue;
    kyos.add(ky);
    const m = String(r[C.month] || '').replace(/^(\d{4})年(\d{1,2})月$/, (_, y, mm) => `${y}-${mm.padStart(2, '0')}`); if (m) months.add(m);
    const e = by[name] || (by[name] = { kyoten: ky, total: 0, ageNG: 0, interviewed: 0, proposed: 0, kengaku: 0, nyusha: 0, byMedia: {}, byMonth: {} });
    const ms = String(r[C.mensetsu] || ''), fl = String(r[C.flag] || ''), te = String(r[C.teian] || '');
    e.total++; if (ms === '年齢NG') e.ageNG++;
    if (fl === '面接実施' || fl === '提案対象') e.interviewed++;
    if (te || ms === '提案対象' || ms === '提案') e.proposed++;
    if (te === '見学') e.kengaku++;
    if (String(r[C.kengaku] || '') === '入社' || String(r[C.nyusha] || '').trim()) e.nyusha++;
    const md = String(r[C.media] || '') || '不明'; e.byMedia[md] = (e.byMedia[md] || 0) + 1;
    if (m) e.byMonth[m] = (e.byMonth[m] || 0) + 1;
  }
  const keep = Object.fromEntries(Object.entries((S.stats && S.stats.byName) || {}).filter(([, e]) => !kyos.has(e.kyoten)));
  const allMonths = new Set([...(S.stats && S.stats.months || []).filter(() => Object.keys(keep).length), ...months]);
  const stats = { importedAt: nowISO(), source: file.name, months: [...allMonths].sort(), byName: { ...keep, ...by } };
  await Store.put('stats', 'applicants', stats);
  toast(`取り込みました：${[...kyos].join('・')}／${Object.keys(by).length}件の案件名`);
}
async function saveConfig() {
  const lines = id => $('#' + id).value.split('\n').map(s => s.trim()).filter(Boolean);
  const split = s => s.split(/[｜|]/).map(x => x.trim());
  const next = {
    ...cfg(),
    kyotens: lines('c-kyo').map(split).map(([id, corp = '', office = '', address = '', tel = '', fax = '']) => ({ id, corp, office, address, tel, fax })),
    staff: lines('c-staff'), media: lines('c-media'),
    approvers: lines('c-appr').map(split).map(([role, name = '']) => ({ role, name })),
    threshold: +$('#c-th').value || 65, fixDays: +$('#c-fix').value || 14, ringiDays: +$('#c-rd').value || 3,
    fixed: { ...cfg().fixed, hitsuyo: $('#c-hitsuyo').value, hoken: $('#c-hoken').value, notes: lines('c-notes') },
  };
  await Store.put('config', 'main', next); toast('設定を保存しました');
}
async function backup() {
  saveFile(`案件管理システム_バックアップ_${today()}.json`, JSON.stringify({ exportedAt: nowISO(), cases: S.cases, postings: S.postings, ads: S.ads, config: S.config, stats: S.stats }, null, 1), 'application/json');
  toast('バックアップを保存しました');
}
