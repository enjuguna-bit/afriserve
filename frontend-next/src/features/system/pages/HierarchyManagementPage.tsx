import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AsyncState } from '../../../components/common/AsyncState'
import { getHierarchyTree } from '../../../services/branchService'
import { queryPolicies } from '../../../services/queryPolicies'
import { listHierarchyEvents } from '../../../services/systemService'
import { formatDisplayDateTime } from '../../../utils/dateFormatting'
import { formatDisplayDetails, formatDisplayText, resolveDisplayText } from '../../../utils/displayFormatting'
import styles from '../../shared/styles/EntityPage.module.css'

export function HierarchyManagementPage() {
  const [eventType, setEventType] = useState('')

  const hierarchyTreeQuery = useQuery({
    queryKey: ['system', 'hierarchy-tree'],
    queryFn: getHierarchyTree,
    ...queryPolicies.list,
  })
  const hierarchyEventsQuery = useQuery({
    queryKey: ['system', 'hierarchy-events', eventType],
    queryFn: () => listHierarchyEvents({
      eventType: eventType.trim() || undefined,
      limit: 100,
      offset: 0,
      sortBy: 'id',
      sortOrder: 'desc',
    }),
    ...queryPolicies.list,
  })

  const loading = hierarchyTreeQuery.isLoading || hierarchyEventsQuery.isLoading
  const error = hierarchyTreeQuery.isError || hierarchyEventsQuery.isError

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>Region / HQ Management</h1>
          <p className={styles.muted}>View headquarters structure, regional branch allocation, and hierarchy events journal.</p>
        </div>
      </div>

      <AsyncState
        loading={loading}
        error={error}
        empty={false}
        loadingText="Loading hierarchy data..."
        errorText="Unable to load hierarchy data."
        onRetry={() => {
          void Promise.all([hierarchyTreeQuery.refetch(), hierarchyEventsQuery.refetch()])
        }}
      />

      {hierarchyTreeQuery.data?.headquarters ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Headquarters</h2>
          <div className={styles.gridThree}>
            <div className={styles.card}>
              <div className={styles.label}>Name</div>
              <div className={styles.value}>{formatDisplayText(hierarchyTreeQuery.data.headquarters.name)}</div>
            </div>
            <div className={styles.card}>
              <div className={styles.label}>Code</div>
              <div className={styles.value}>{formatDisplayText(hierarchyTreeQuery.data.headquarters.code)}</div>
            </div>
            <div className={styles.card}>
              <div className={styles.label}>Location</div>
              <div className={styles.value}>{formatDisplayText(hierarchyTreeQuery.data.headquarters.location)}</div>
            </div>
          </div>
        </section>
      ) : null}

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Regions and branches</h2>
        {hierarchyTreeQuery.data?.regions && hierarchyTreeQuery.data.regions.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Region</th>
                  <th>Code</th>
                  <th>Status</th>
                  <th>Branch count</th>
                  <th>Branches</th>
                </tr>
              </thead>
              <tbody>
                {(hierarchyTreeQuery.data?.regions ?? []).map((region) => (
                  <tr key={region.id}>
                    <td>{formatDisplayText(region.name)}</td>
                    <td className={styles.mono}>{formatDisplayText(region.code)}</td>
                    <td>
                      <span className={Number(region.is_active) === 1 ? styles.badgeActive : styles.badgeMuted}>
                        {Number(region.is_active) === 1 ? 'active' : 'inactive'}
                      </span>
                    </td>
                    <td>{Number(region.branch_count || region.branches.length || 0)}</td>
                    <td>
                      {region.branches.length > 0 ? (
                        <div className={styles.actions}>
                          {region.branches.map((branch) => (
                            <span key={branch.id} className={styles.badgeMuted}>
                              {branch.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className={styles.muted}>No branches</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.muted}>No hierarchy records were returned.</p>
        )}
      </section>

      <section className={styles.panel}>
        <div className={styles.toolbar}>
          <h2 className={styles.panelTitle}>Hierarchy events</h2>
          <label className={styles.inputGroupWide}>
            <span>Event type filter</span>
            <input
              value={eventType}
              onChange={(event) => setEventType(event.target.value)}
              placeholder="e.g. hierarchy.branch.updated"
            />
          </label>
        </div>
        {hierarchyEventsQuery.data?.data && hierarchyEventsQuery.data.data.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Event</th>
                  <th>Scope</th>
                  <th>Region</th>
                  <th>Branch</th>
                  <th>Actor</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {(hierarchyEventsQuery.data?.data ?? []).map((event) => (
                  <tr key={event.id}>
                    <td>{formatDisplayDateTime(event.created_at)}</td>
                    <td className={styles.mono}>{formatDisplayText(event.event_type)}</td>
                    <td>{formatDisplayText(event.scope_level)}</td>
                    <td>{resolveDisplayText([event.region_name, event.region_id])}</td>
                    <td>{resolveDisplayText([event.branch_name, event.branch_id])}</td>
                    <td>{resolveDisplayText([event.actor_user_name, event.actor_user_id])}</td>
                    <td>
                      <pre className={styles.pre}>{formatDisplayDetails(event.details)}</pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.muted}>No hierarchy events for the current filter.</p>
        )}
      </section>
    </div>
  )
}
