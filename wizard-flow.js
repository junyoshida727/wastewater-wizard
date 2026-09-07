(function (root) {
  'use strict';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const list = value => Array.isArray(value) ? value.filter(Boolean) : [];

  // Engineering-style process sketch, not a fabrication drawing or a P&ID.
  // Keep the existing upper (supernatant) and lower (sludge) process paths.
  function build(d, options = {}) {
    const prefix = String(options.idPrefix || 'ww-flow').replace(/[^a-zA-Z0-9_-]/g, '-') || 'ww-flow';
    const selected = (field, name) => list(d[field]).includes(name);
    const hasRelay = selected('option_tanks', '中継槽');
    const hasMonitor = selected('option_tanks', '監視槽');
    const hasSludge = selected('option_tanks', '汚泥貯槽');
    const filterConfigured = Boolean(d.filter_branches) && !['不明', 'ろ過しない'].includes(d.filter_branches);
    const powder = d.powder_feeder === '使用する';
    const chemicals = list(d.chemicals).filter(name => !(powder && name === '液体凝集剤'));
    const otherCount = d.chem_other_selected ? Number(d.chem_other_count) : 0;
    // Counts are bounded by the form; malformed drafts must not create unbounded SVG.
    if (Number.isInteger(otherCount) && otherCount > 0 && otherCount <= 20) {
      for (let n = 1; n <= otherCount; n++) chemicals.push(otherCount === 1 ? 'その他' : `その他 ${n}`);
    }
    const feeds = chemicals.map((name, i) => ({
      tag: `CH-${String(i + 1).padStart(2, '0')}`, pump: `DP-${String(i + 1).padStart(2, '0')}`,
      name, detail: d.chem_details?.[name]?.name || '薬剤名未入力', amount: d.chem_details?.[name]?.amount || '添加量未入力', type: 'liquid'
    }));
    if (powder) feeds.push({ tag: 'PF-01', name: '粉体供給機', detail: '粉体投入', type: 'powder' });

    const raw = { id: 'TK-01', name: '原水槽', x: 80, w: 140, y: 510, h: 140 };
    const relay = { id: 'TK-03', name: '中継槽', x: 330, w: 140, y: 510, h: 140 };
    const coag = { id: 'TK-02', name: '凝集沈殿槽', x: hasRelay ? 600 : 360, w: Math.max(200, feeds.length * 18 + 120), y: 490, h: 230 };
    const monitor = { id: 'TK-05', name: '監視槽', x: coag.x + coag.w + 110, w: 140, y: 510, h: 140 };
    const upperEnd = hasMonitor ? monitor.x + monitor.w + 140 : coag.x + coag.w + 180;
    const sludge = { id: 'TK-04', name: '汚泥貯槽', x: coag.x - 220, w: 140, y: 835, h: 120 };
    const filter = { id: 'FL-01', name: 'ろ過装置', x: coag.x + 110, w: 150, y: 835, h: 130 };
    const drawingRight = Math.max(1200, upperEnd + 40, filter.x + filter.w + 160, 70 + feeds.length * 170);
    const tableX = drawingRight + 50;
    const width = tableX + 430;
    const equipment = [
      ['-', '1日の排水量', d.daily_volume ? `${d.daily_volume} m³/日` : '未入力'],
      ['-', '排水の種類・内容', d.wastewater_type || '未入力'],
      [raw.id, raw.name, d.raw_tank === 'あり' ? (d.raw_tank_size ? `${d.raw_tank_size} m³ / 既設` : '既設 / 容量未入力') : d.raw_tank === 'なし' ? '未設置 / 要検討' : '有無未確認'],
      [coag.id, coag.name, d.tank_capacity || '容量未選択'],
      ...(hasRelay ? [[relay.id, relay.name, '選択あり / 容量未確定']] : []),
      ...(hasSludge ? [[sludge.id, sludge.name, '選択あり / 容量未確定']] : []),
      ...(hasMonitor ? [[monitor.id, monitor.name, '選択あり / 容量未確定']] : []),
      ...(filterConfigured ? [[filter.id, filter.name, d.filter_branches]] : []),
      ...feeds.flatMap(feed => feed.type === 'powder' ? [[feed.tag, feed.name, '使用する / 仕様未確定']] : [
        [feed.tag, feed.name, feed.detail], [feed.pump, '薬注ポンプ', `${feed.tag}用 / ${feed.amount}`]
      ]),
      ...(d.option_dehydrator === '必要' ? [['DH-01', '脱水機（接続未確定）', [d.dehydrator_maker, d.dehydrator_model].filter(Boolean).join(' / ') || '仕様未入力']] : []),
      ...list(d.extra_pumps).map((pump, i) => [`AP-${String(i + 1).padStart(2, '0')}`, pump.name || '追加ポンプ', `${pump.count || '?'}台 / ${pump.lph || '?'}kW / 接続未確定`])
    ];
    const wrap = (value, columns) => {
      const lines = [];
      String(value ?? '').split(/\r?\n/).forEach(line => {
        let chunk = '', size = 0;
        for (const ch of line) {
          const weight = /[\u0020-\u007e]/.test(ch) ? 0.55 : 1;
          if (size + weight > columns && chunk) { lines.push(chunk); chunk = ''; size = 0; }
          chunk += ch; size += weight;
        }
        lines.push(chunk);
      });
      return lines;
    };
    const rowHeights = equipment.map(row => Math.max(48, wrap(row[1], 11).length * 18 + wrap(row[2], 19).length * 16 + 18));
    const tableBottom = 142 + rowHeights.reduce((a, b) => a + b, 0);
    const height = Math.max(1180, tableBottom + 255);
    const footerY = height - 150;
    const pieces = [];
    const line = (x1, y1, x2, y2, attrs = '') => pieces.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${attrs}/>`);
    const text = (x, y, value, size = 14, anchor = 'start', attrs = '') => pieces.push(`<text x="${x}" y="${y}" fill="#20252b" stroke="none" font-size="${size}" text-anchor="${anchor}" ${attrs}>${esc(value)}</text>`);
    const multiline = (x, y, value, columns, size = 14, anchor = 'start') => {
      wrap(value, columns).forEach((value, i) => text(x, y + i * (size + 4), value, size, anchor));
    };
    const rect = (x, y, w, h, attrs = '') => pieces.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" ${attrs}/>`);
    const pipe = (id, from, to, points, kind = 'process') => {
      const path = points.map((point, i) => `${i ? 'L' : 'M'}${point[0]},${point[1]}`).join(' ');
      // White underlay denotes unconnected crossings; no shared chemical header.
      pieces.push(`<path d="${path}" fill="none" stroke="white" stroke-width="7"/>`);
      pieces.push(`<path data-pipe="${esc(id)}" data-from="${esc(from)}" data-to="${esc(to)}" data-kind="${kind}" d="${path}" fill="none" stroke-width="${kind === 'process' ? 2.4 : 1.5}" ${kind === 'chemical' ? 'stroke-dasharray="7 4"' : ''} marker-end="url(#${prefix}-arrow)"/>`);
    };
    const caption = (tank, detail) => {
      if (tank === coag) {
        // Leave the bottom outlet clear; the sludge pipe must not cross text.
        text(tank.x - 20, tank.y + tank.h + 24, `${tank.id}  ${tank.name}`, 16, 'end');
        line(tank.x - 215, tank.y + tank.h + 31, tank.x - 20, tank.y + tank.h + 31);
        text(tank.x - 20, tank.y + tank.h + 50, detail, 12, 'end');
        return;
      }
      text(tank.x + tank.w / 2, tank.y + tank.h + 24, `${tank.id}  ${tank.name}`, 16, 'middle');
      line(tank.x + 5, tank.y + tank.h + 31, tank.x + tank.w - 5, tank.y + tank.h + 31);
      text(tank.x + tank.w / 2, tank.y + tank.h + 50, detail, 12, 'middle');
    };
    const instrument = (cx, cy, label, targetY, targetX = cx, bendY = cy + 26) => {
      pieces.push(`<g data-instrument="${esc(label)}"><circle cx="${cx}" cy="${cy}" r="18" fill="white"/><text x="${cx}" y="${cy + 5}" fill="#20252b" stroke="none" font-size="13" text-anchor="middle">${esc(label)}</text><path d="M${cx},${cy + 18} V${bendY} H${targetX} V${targetY}" stroke-dasharray="4 3" fill="none"/></g>`);
    };
    const instruments = tank => {
      const labels = [];
      if (tank === coag || selected('option_ph_tanks', tank.name)) labels.push('pH');
      if (selected('option_turbidity_tanks', tank.name)) labels.push('TU');
      if (tank === coag || selected('level_sensors', tank.name)) labels.push('LS');
      labels.forEach((label, i) => tank === coag
        ? instrument(tank.x + tank.w + 35 + i * 45, tank.y - 40, label, tank.y + 40, tank.x + tank.w - 16 - i * 14, tank.y - 14 + i * 8)
        : instrument(tank.x + tank.w - 20 - i * 45, tank.y - 46, label, tank.y + 40));
    };
    const drawTank = (tank, detail, dashed = false, conical = false) => {
      pieces.push(`<g data-equipment="${tank.id}" ${dashed ? 'stroke-dasharray="6 4"' : ''}>`);
      if (conical) {
        pieces.push(`<path d="M${tank.x},${tank.y} V${tank.y + 150} L${tank.x + tank.w / 2 - 18},${tank.y + tank.h} H${tank.x + tank.w / 2 + 18} L${tank.x + tank.w},${tank.y + 150} V${tank.y}" fill="white" stroke-width="2"/>`);
        // Schematic mixer; no inferred power, make, motor control or dimensions.
        const mx = tank.x + 62;
        pieces.push(`<circle cx="${mx}" cy="${tank.y - 35}" r="18" fill="white"/>`);
        text(mx, tank.y - 29, 'M', 17, 'middle');
        line(mx, tank.y - 17, mx + 18, tank.y + 132);
        pieces.push(`<ellipse cx="${mx + 8}" cy="${tank.y + 132}" rx="14" ry="5"/><ellipse cx="${mx + 33}" cy="${tank.y + 129}" rx="14" ry="5"/>`);
      } else {
        pieces.push(`<path d="M${tank.x},${tank.y} V${tank.y + tank.h} H${tank.x + tank.w} V${tank.y}" fill="white" stroke-width="2"/>`);
      }
      line(tank.x + 3, tank.y + 48, tank.x + tank.w - 3, tank.y + 48);
      line(tank.x + tank.w / 2 - 28, tank.y + 56, tank.x + tank.w / 2 + 28, tank.y + 56);
      line(tank.x + tank.w / 2 - 16, tank.y + 63, tank.x + tank.w / 2 + 16, tank.y + 63);
      pieces.push('</g>');
      caption(tank, detail);
      instruments(tank);
    };

    pieces.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${prefix}-title ${prefix}-desc">`);
    pieces.push(`<title id="${prefix}-title">排水処理設備 概略フロー図</title><desc id="${prefix}-desc">${esc(`装置容量 ${d.tank_capacity || '未選択'}。上澄液と汚泥を分けた現行処理フロー。機器記号、薬品別投入線、機器一覧、凡例、図面表題欄を表示。施工用図面ではありません。`)}</desc>`);
    pieces.push(`<defs><marker id="${prefix}-arrow" viewBox="0 0 10 8" refX="9" refY="4" markerWidth="7" markerHeight="6" orient="auto"><path d="M0 0 L10 4 L0 8" fill="none" stroke="#20252b" stroke-width="1.2"/></marker></defs>`);
    rect(0, 0, width, height, 'fill="white"');
    pieces.push('<g fill="none" stroke="#20252b" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round" font-family="Arial, Hiragino Kaku Gothic ProN, Yu Gothic, sans-serif">');
    rect(24, 24, width - 48, height - 48);
    text(48, 62, '排水処理設備  概略フロー図', 24, 'start', 'font-weight="600"');
    text(drawingRight, 62, '計画検討用 / NOT TO SCALE', 13, 'end');
    line(24, 82, width - 24, 82);

    text(54, 112, '記号・線種', 14, 'start', 'font-weight="600"');
    line(55, 132, 105, 132, `stroke-width="2.4" marker-end="url(#${prefix}-arrow)"`);
    text(115, 137, '排水・処理水・汚泥', 12);
    line(315, 132, 365, 132, `stroke-dasharray="7 4" marker-end="url(#${prefix}-arrow)"`);
    text(375, 137, '薬品投入（各別配管）', 12);
    line(580, 132, 630, 132, `stroke-width="1.5" marker-end="url(#${prefix}-arrow)"`);
    text(640, 137, '粉体投入', 12);
    text(54, 160, 'M：撹拌機  /  pH：pH計  /  TU：濁度計  /  LS：液位検出', 12);
    text(54, 179, '破線の槽：有無・設置を要確認。線の交差部は接続なし。', 12);

    // Each dosing source has its own line and its own vessel entry point.
    feeds.forEach((feed, i) => {
      const x = Math.max(65, coag.x + coag.w / 2 - (feeds.length - 1) * 85 - 58) + i * 170;
      const portX = coag.x + 95 + (i + 1) * (coag.w - 140) / (feeds.length + 1);
      const routeY = 365 + i * Math.min(6, 60 / Math.max(1, feeds.length - 1));
      pipe(`feed-${i + 1}`, feed.tag, coag.id, [[x + 58, 340], [x + 58, routeY], [portX, routeY], [portX, coag.y - 3]], feed.type === 'liquid' ? 'chemical' : 'powder');
      pieces.push(`<g data-equipment="${feed.tag}">`);
      text(x + 58, 210, feed.tag, 13, 'middle');
      if (feed.type === 'powder') {
        pieces.push(`<path d="M${x + 10},230 H${x + 106} L${x + 73},292 H${x + 43} Z" fill="white" stroke-width="1.8"/>`);
        rect(x + 40, 292, 36, 18, 'fill="white"');
        line(x + 58, 310, x + 58, 340);
      } else {
        rect(x + 22, 232, 72, 63, 'fill="white" stroke-width="1.8"');
        line(x + 23, 254, x + 93, 254);
        line(x + 58, 295, x + 58, 302);
        pieces.push(`<g data-equipment="${feed.pump}"><circle cx="${x + 58}" cy="316" r="14" fill="white"/><path d="M${x + 47},323 L${x + 58},304 L${x + 69},323 Z" fill="white"/></g>`);
        line(x + 58, 330, x + 58, 340);
        text(x + 85, 321, feed.pump, 11);
      }
      pieces.push('</g>');
      // The table carries full names; tags keep the dense diagram readable.
      text(x + 58, 225, feed.type === 'powder' ? '粉体供給機' : '薬品槽', 12, 'middle');
    });
    if (!feeds.length) text(65, 265, '薬品・粉体供給機：選択内容を確認してください', 15);

    pipe('raw-inlet', '原水流入', raw.id, [[48, 466], [raw.x + 28, 466], [raw.x + 28, raw.y - 3]]);
    text(50, 448, '原水', 15);
    const upstream = hasRelay ? relay : raw;
    if (hasRelay) pipe('raw-relay', raw.id, relay.id, [[raw.x + raw.w, 558], [relay.x, 558]]);
    pipe('reactor-inlet', upstream.id, coag.id, [[upstream.x + upstream.w, 558], [coag.x, 558]]);
    if (hasMonitor) {
      pipe('supernatant-monitor', coag.id, monitor.id, [[coag.x + coag.w, 550], [monitor.x, 550]]);
      pipe('supernatant-discharge', monitor.id, '放流', [[monitor.x + monitor.w, 550], [upperEnd, 550]]);
    } else pipe('supernatant-discharge', coag.id, '放流', [[coag.x + coag.w, 550], [upperEnd, 550]]);
    text(coag.x + coag.w + 16, 532, '上澄液', 14);
    text(upperEnd, 578, '放流', 15, 'end');
    multiline(upperEnd, 598, d.discharge_dest || '放流先未確認', 12, 12, 'end');
    drawTank(raw, d.raw_tank === 'あり' ? `${d.raw_tank_size || '?'} m³ / 既設` : '有無・設置要確認', d.raw_tank !== 'あり');
    if (hasRelay) drawTank(relay, 'オプション');
    drawTank(coag, d.tank_capacity || '容量未選択', false, true);
    if (hasMonitor) drawTank(monitor, 'オプション');

    const bottomPort = [coag.x + coag.w / 2, coag.y + coag.h];
    if (hasSludge) {
      pipe('sludge-storage', coag.id, sludge.id, [bottomPort, [bottomPort[0], 818], [sludge.x + sludge.w / 2, 818], [sludge.x + sludge.w / 2, sludge.y - 3]]);
      drawTank(sludge, 'オプション');
    }
    if (filterConfigured) {
      const start = hasSludge ? [sludge.x + sludge.w, 885] : bottomPort;
      pipe('sludge-filter', hasSludge ? sludge.id : coag.id, filter.id, hasSludge ? [start, [filter.x + 12, 885]] : [start, [start[0], 808], [filter.x + 75, 808], [filter.x + 75, filter.y - 3]]);
      pieces.push(`<g data-equipment="${filter.id}">`);
      rect(filter.x + 15, filter.y, filter.w - 30, filter.h - 20, 'fill="white" stroke-width="1.8"');
      line(filter.x + 15, filter.y, filter.x + filter.w - 15, filter.y + filter.h - 20);
      line(filter.x + filter.w - 15, filter.y, filter.x + 15, filter.y + filter.h - 20);
      pieces.push(`<path d="M${filter.x},${filter.y + 90} V${filter.y + filter.h} H${filter.x + filter.w} V${filter.y + 90}"/>`);
      pieces.push('</g>');
      if (selected('level_sensors', 'ろ過受け槽')) instrument(filter.x - 30, filter.y + 80, 'LS', filter.y + filter.h - 8, filter.x + 6);
      caption(filter, d.filter_branches);
      pipe('filtrate-discharge', filter.id, 'ろ過水放流', [[filter.x + filter.w, filter.y + filter.h - 12], [drawingRight - 25, filter.y + filter.h - 12]]);
      text(drawingRight - 25, filter.y + filter.h - 28, 'ろ過水 → 放流', 14, 'end');
    } else if (!hasSludge) {
      pipe('sludge-unconfirmed', coag.id, '汚泥処理要確認', [bottomPort, [bottomPort[0], 852]]);
      rect(coag.x + 5, 860, 190, 76, 'stroke-dasharray="6 4"');
      text(coag.x + 100, 890, d.filter_branches === 'ろ過しない' ? 'ろ過なし' : 'ろ過条件未確認', 15, 'middle');
      text(coag.x + 100, 916, '汚泥処理方法を確認', 13, 'middle');
    }
    text(coag.x + coag.w / 2 + 16, 785, '汚泥', 14);
    if (hasSludge && !filterConfigured) {
      text(sludge.x + sludge.w / 2, sludge.y + sludge.h + 70, '後段の汚泥処理方法を確認', 12, 'middle');
    }

    // Equipment schedule and title block use growing rows, never clipped labels.
    rect(tableX, 100, 380, tableBottom - 100);
    text(tableX + 14, 126, '機器一覧・入力仕様', 17, 'start', 'font-weight="600"');
    let rowY = 142;
    equipment.forEach((row, i) => {
      line(tableX, rowY, tableX + 380, rowY);
      text(tableX + 12, rowY + 24, row[0], 13);
      multiline(tableX + 92, rowY + 22, row[1], 11, 14);
      multiline(tableX + 92, rowY + 22 + wrap(row[1], 11).length * 18, row[2], 19, 12);
      rowY += rowHeights[i];
    });
    line(tableX + 80, 142, tableX + 80, tableBottom);
    text(tableX, tableBottom + 28, '計器：選択した設置槽に記号を表示', 12);
    text(tableX, tableBottom + 47, 'pH計・液位検出は凝集沈殿槽に標準表示。', 12);
    text(tableX, tableBottom + 66, '追加ポンプ・脱水機の接続は別途検討。', 12);

    line(24, footerY, width - 24, footerY);
    text(48, footerY + 25, '設計確認事項', 14, 'start', 'font-weight="600"');
    text(48, footerY + 48, '1. ヒアリング情報に基づく概略図。製作用・施工用図面ではありません。', 13);
    text(48, footerY + 70, '2. 配管口径・弁種・材質・制御配線・機器仕様・設置寸法は未確定です。', 13);
    text(48, footerY + 92, '3. 上澄液の放流可否・処理水質・特殊排水の前処理構成は別途確認してください。', 13);
    const titleX = Math.max(tableX - 140, 790);
    line(titleX, footerY, titleX, height - 24);
    line(titleX, footerY + 50, width - 24, footerY + 50);
    text(titleX + 14, footerY + 20, '案件名', 11);
    // Full customer name remains in the hearing sheet; SVG includes a title tooltip.
    const customerLines = wrap(d.customer_name || '顧客名未入力', 26);
    text(titleX + 14, footerY + 41, customerLines[0] + (customerLines.length > 1 ? '…' : ''), 16);
    pieces.push(`<title>${esc(d.customer_name || '顧客名未入力')}</title>`);
    text(titleX + 14, footerY + 73, '図面名：排水処理設備 概略フロー図', 16);
    text(titleX + 14, footerY + 98, `装置容量：${d.tank_capacity || '未選択'}  /  縮尺：NTS  /  計画検討用`, 13);
    pieces.push('</g></svg>');
    return pieces.join('');
  }

  root.WizardFlow = { build };
})(typeof window !== 'undefined' ? window : globalThis);
