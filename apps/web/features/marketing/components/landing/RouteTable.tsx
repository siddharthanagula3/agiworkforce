import Link from 'next/link';
import { ROUTES } from './landing-content';

const CAPTION = 'How the three routes differ';

export function RouteTable() {
  return (
    <div className="agi-home-routes">
      <table className="agi-home-route-table">
        <caption className="agi-home-sr">{CAPTION}</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="agi-home-sr">Question</span>
            </th>
            {ROUTES.columns.map((column) => (
              <th scope="col" key={column.lane} data-lane={column.lane}>
                <span className="agi-home-lane-mark" aria-hidden="true" />
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROUTES.rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {row.values.map((value, position) => (
                <td
                  key={ROUTES.columns[position]!.lane}
                  data-lane={ROUTES.columns[position]!.lane}
                  data-label={ROUTES.columns[position]!.title}
                >
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>
              <span className="agi-home-sr">Next step</span>
            </td>
            {ROUTES.columns.map((column) => (
              <td key={column.lane} data-lane={column.lane} data-label={column.title}>
                <Link href={column.cta.href} className="agi-home-link">
                  {column.cta.label}
                </Link>
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
