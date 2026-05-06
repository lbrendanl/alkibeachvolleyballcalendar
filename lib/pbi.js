// Power BI proxy + DSR parser for Seattle Parks volleyball reservations
'use strict';

const PBI_HOST = 'wabi-us-gov-iowa-api.analysis.usgovcloudapi.net';
const PBI_PATH = '/public/reports/querydata?synchronous=true';
const PBI_RESOURCE_KEY = 'a1bb598c-f10d-4b36-b5c8-a7550c22107b';
const ALKI_PREFIX = 'Alki Beach Park Volleyball East Court 0';

// Exact query from the Seattle Parks Power BI report, scoped to today
// and filtered to Alki East Courts at parse time.
const QUERY_BODY = JSON.stringify({
  version: '1.0.0',
  queries: [{
    Query: {
      Commands: [{
        SemanticQueryDataShapeCommand: {
          Query: {
            Version: 2,
            From: [
              { Name: 'f',  Entity: 'FACILITY_RESERVATION', Type: 0 },
              { Name: 'f1', Entity: 'FACILITIES',           Type: 0 },
              { Name: 'a',  Entity: 'ACTIVE_HUB_DATES',    Type: 0 },
            ],
            Select: [
              { Column: { Expression: { SourceRef: { Source: 'f'  } }, Property: 'RESERVATION_START_TIME'  }, Name: 'FACILITY_RESERVATION.RESERVATION_START_TIME'  },
              { Column: { Expression: { SourceRef: { Source: 'f'  } }, Property: 'RESERVATION_END_TIME'    }, Name: 'FACILITY_RESERVATION.RESERVATION_END_TIME'    },
              { Column: { Expression: { SourceRef: { Source: 'f1' } }, Property: 'FACILITY_NAME'           }, Name: 'FACILITIES.FACILITY_NAME'                    },
              { Column: { Expression: { SourceRef: { Source: 'f1' } }, Property: 'URL'                    }, Name: 'FACILITIES.URL'                               },
              { Column: { Expression: { SourceRef: { Source: 'f'  } }, Property: 'RESERVATION_START_DATE' }, Name: 'FACILITY_RESERVATION.RESERVATION_START_DATE'  },
              { Column: { Expression: { SourceRef: { Source: 'f'  } }, Property: 'Court Use'              }, Name: 'FACILITY_RESERVATION.Event'                   },
              { Column: { Expression: { SourceRef: { Source: 'f'  } }, Property: 'StartEnd'               }, Name: 'FACILITY_RESERVATION.StartEnd'                },
            ],
            Where: [
              // Only today
              { Condition: { In: { Expressions: [{ Column: { Expression: { SourceRef: { Source: 'a' } }, Property: 'DateForSlicer' } }], Values: [[{ Literal: { Value: "'Today'" } }]] } } },
              // Non-null date guards
              { Condition: { Not: { Expression: { Comparison: { ComparisonKind: 0, Left: { Column: { Expression: { SourceRef: { Source: 'f' } }, Property: 'RESERVATION_START_DATE' } }, Right: { Literal: { Value: 'null' } } } } } } },
              { Condition: { Not: { Expression: { Comparison: { ComparisonKind: 0, Left: { Column: { Expression: { SourceRef: { Source: 'a' } }, Property: 'dt_do'                } }, Right: { Literal: { Value: 'null' } } } } } } },
            ],
            OrderBy: [{ Direction: 1, Expression: { Column: { Expression: { SourceRef: { Source: 'f1' } }, Property: 'FACILITY_NAME' } } }],
          },
          Binding: {
            Primary: { Groupings: [{ Projections: [2, 3, 4, 0, 1, 5, 6] }] },
            DataReduction: { DataVolume: 3, Primary: { Window: { Count: 10000 } } },
            Version: 1,
          },
          ExecutionMetricsKind: 1,
        },
      }],
    },
    QueryId: '',
    ApplicationContext: {
      DatasetId: '0c6547a9-5085-43ba-8f24-c313370da546',
      Sources: [{ ReportId: '471280dd-7586-4d9d-a9c6-73acb618f9bc', VisualId: 'b00d53556a1f923ddae6' }],
    },
  }],
  cancelQueries: [],
  modelId: 900996,
});

// ── DSR parser ────────────────────────────────────────────────────────────────
//
// Power BI returns data in a compressed "DSR" (Data Shape Result) format.
// Each DM0 entry is a row in delta-encoded form: only CHANGED columns appear
// in the C array, in schema order.  Column identity is inferred by value type:
//
//   • Dict column (col.DN set)  → small integer (index into ValueDicts[col.DN])
//     If the index is out of range for that dict, skip to the next dict column.
//   • Date column (first T:7)   → big integer (ms timestamp)
//   • Time columns (subsequent T:7) → ISO string starting with "1899-12-30T"
//
// When a value's type doesn't match the current schema column, that column is
// skipped (inheriting its previous value) and we try the next one.

function parseC(C, schema, dicts, firstT7Idx) {
  const result = {};
  let si = 0;

  for (const val of C) {
    while (si < schema.length) {
      const colIdx = si;
      const col    = schema[si++];

      if (col.DN) {
        // Dict column: needs a small integer with a valid entry in its dict
        if (Number.isInteger(val) && val >= 0) {
          const dict = dicts[col.DN];
          if (dict && val < dict.length) {
            result[col.N] = dict[val];
            break; // consumed this C value
          }
        }
        // type mismatch or dict miss → skip column, don't consume value

      } else if (col.T === 7) {
        if (colIdx === firstT7Idx) {
          // First T:7 = date column → big ms timestamp
          if (typeof val === 'number' && val > 1e12) {
            result[col.N] = val;
            break;
          }
        } else {
          // Subsequent T:7 = time columns → "1899-12-30T..." string
          if (typeof val === 'string' && val.startsWith('1899-12-30T')) {
            result[col.N] = val;
            break;
          }
        }
        // type mismatch → skip column, don't consume value
      }
    }
  }

  return result;
}

function parsePBIResponse(body) {
  let json;
  try { json = JSON.parse(body); } catch { return []; }

  const ds = json?.results?.[0]?.result?.data?.dsr?.DS?.[0];
  if (!ds) return [];

  const dicts = ds.ValueDicts || {};
  const dm0   = ds.PH?.[0]?.DM0;
  if (!dm0)   return [];

  let schema = null, firstT7Idx = -1;
  let currentRow = {};
  const reservations = [];

  for (const seg of dm0) {
    if (seg.S) {
      schema     = seg.S;
      firstT7Idx = schema.findIndex(c => c.T === 7 && !c.DN);
    }
    if (!schema || !seg.C) continue;

    const delta = parseC(seg.C, schema, dicts, firstT7Idx);

    // New court → reset time fields so stale values don't bleed across courts
    if ('G0' in delta && delta.G0 !== currentRow.G0) {
      currentRow = { G0: delta.G0, G1: delta.G1 };
    }
    Object.assign(currentRow, delta);

    // Valid reservation for an Alki East Court: has new start + end time
    if ('G3' in delta && 'G4' in delta && currentRow.G0?.startsWith(ALKI_PREFIX)) {
      reservations.push({
        courtName: currentRow.G0,  // "Alki Beach Park Volleyball East Court 01"
        startTime: currentRow.G3,  // "1899-12-30T17:30:00"
        endTime:   currentRow.G4,  // "1899-12-30T20:00:00"
      });
    }
  }

  return reservations;
}

module.exports = { PBI_HOST, PBI_PATH, PBI_RESOURCE_KEY, QUERY_BODY, parsePBIResponse };
