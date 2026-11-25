// Name suggestions for the add form: the names used before, most used first.

import { groupByName, itemsOfKind } from './reports.js';

export function suggestNames(doc, kind = 'other') {
  return groupByName(itemsOfKind(doc, kind)).sort((a, b) => b.count - a.count).map((g) => g.name);
}
