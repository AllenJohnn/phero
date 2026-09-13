export function convertTableToMarkdown(table) {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (rows.length === 0) return '';
  const tableData = [];
  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll('th, td')).map(cell => cell.textContent?.replace(/\|/g, '\\|').trim() || '');
    if (cells.length > 0) {
      tableData.push(cells);
    }
  }
  if (tableData.length === 0) return '';
  const columnCount = Math.max(...tableData.map(r => r.length));
  const normalized = tableData.map(row => {
    while (row.length < columnCount) row.push('');
    return row;
  });
  const headerRow = normalized[0];
  const headerLine = `| ${headerRow.join(' | ')} |`;
  const separatorLine = `| ${headerRow.map(() => '---').join(' | ')} |`;
  const bodyLines = normalized.slice(1).map(row => `| ${row.join(' | ')} |`);
  return [headerLine, separatorLine, ...bodyLines].join('\n');
}
