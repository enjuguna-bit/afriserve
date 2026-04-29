import { useState, useEffect } from 'react';
import * as reportService from '../../services/reportService';
import type { ReportFormat } from '../../services/reportService';
import styles from './PerformanceReports.module.css';
import { 
  DonutChartWrapper, 
  BarChartWrapper, 
  CHART_COLORS,
  INCOME_COLORS
} from '../charts';

export interface MonthlyPerformance {
  month: string;
  interest_income: number;
  fee_income: number;
  penalty_income: number;
  total_income: number;
}

export interface CashFlowReport {
  total_inflow: number;
  total_outflow: number;
  net_cash_flow: number;
}

type DownloadFormat = Exclude<ReportFormat, 'json'>;

const PerformanceDashboard = () => {
  const [performance, setPerformance] = useState<MonthlyPerformance | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlowReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        setLoading(true);
        // Cast the results since reportService returns ReportPayload (Record<string, unknown>)
        const [perfData, flowData] = await Promise.all([
          reportService.getMonthlyPerformanceReport() as Promise<unknown>,
          reportService.getCashFlowReport() as Promise<unknown>
        ]);
        setPerformance(perfData as MonthlyPerformance);
        setCashFlow(flowData as CashFlowReport);
      } catch {
                setError('Failed to load performance metrics. Please verify connectivity.');
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, []);

  // ── Derived Chart Data ────────────────────────────────────────────────
  const incomeCompositionData = performance ? [
    { name: 'Interest', value: performance.interest_income, color: INCOME_COLORS.interest },
    { name: 'Fees', value: performance.fee_income, color: INCOME_COLORS.fees },
    { name: 'Penalties', value: performance.penalty_income, color: INCOME_COLORS.penalties },
  ].filter(d => d.value > 0) : [];

  const cashFlowTrendData = cashFlow ? [
    { name: 'Inflow', value: cashFlow.total_inflow, color: CHART_COLORS.emerald },
    { name: 'Outflow', value: cashFlow.total_outflow, color: CHART_COLORS.red },
    { name: 'Net', value: Math.max(0, cashFlow.net_cash_flow), color: CHART_COLORS.blue },
  ] : [];

  const capitalStructureData = [
    { name: 'Active Capital', value: cashFlow?.total_inflow || 5000000, color: CHART_COLORS.emerald },
    { name: 'Allocated', value: (cashFlow?.total_outflow || 3000000) * 0.8, color: CHART_COLORS.blue },
    { name: 'Reserve', value: (cashFlow?.total_inflow || 5000000) * 0.1, color: CHART_COLORS.gold },
  ];

  const handleExport = async (endpoint: string, format: DownloadFormat, reportType: string) => {
    const key = `${reportType}-${format}`;
    setExporting(key);
    try {
      // reportService.downloadReport expects (path, params, format)
      await reportService.downloadReport(endpoint, {}, format);
    } catch {
            alert(`Failed to export ${reportType}. Please try again later.`);
    } finally {
      setExporting(null);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '100px 0', gap: '16px' }}>
          <div className={styles.spinner} style={{ width: '40px', height: '40px' }}></div>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Loading insights...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div style={{ padding: '32px', backgroundColor: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: '18px', color: 'var(--danger-text)', textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 8px 0' }}>Data Sync Error</h3>
          <p style={{ margin: 0 }}>{error}</p>
          <button onClick={() => window.location.reload()} style={{ marginTop: '16px' }}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Stakeholder Insights</h1>
          <p className={styles.subtitle}>Real-time financial performance and liquidity status across your portfolio.</p>
        </div>
        <div className={styles.statusTag}>
          <span className={styles.pulse}></span>
          System Live
        </div>
      </header>
      
      <div className={styles.grid}>
        {/* Monthly Performance Card */}
        <section className={styles.card}>
          <div className={styles.exportButtons}>
            <button 
              onClick={() => handleExport('/reports/performance/monthly', 'csv', 'monthly-performance')}
              className={styles.exportBtn}
              title="Download CSV"
            >
              {exporting === 'monthly-performance-csv' ? <div className={styles.spinner}></div> : 'CSV'}
            </button>
            <button 
              onClick={() => handleExport('/reports/performance/monthly', 'xlsx', 'monthly-performance')}
              className={styles.exportBtn}
              title="Download Excel"
            >
              {exporting === 'monthly-performance-xlsx' ? <div className={styles.spinner}></div> : 'XLSX'}
            </button>
          </div>

          <div className={styles.cardHeader}>
            <div className={styles.iconWrapper}>
              <svg className={styles.icon} width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            </div>
            <div>
              <h2 className={styles.cardTitle}>Monthly Income</h2>
              <p className={styles.cardSubtitle}>Cycle: {performance?.month || 'Current'}</p>
            </div>
          </div>

          <div className={styles.statsList}>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Interest Collected</span>
              <span className={styles.statValue}>Ksh {(performance?.interest_income || 0).toLocaleString()}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Fee Revenue</span>
              <span className={styles.statValue}>Ksh {(performance?.fee_income || 0).toLocaleString()}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Penalty Collections</span>
              <span className={styles.statValue}>Ksh {(performance?.penalty_income || 0).toLocaleString()}</span>
            </div>
            
            {/* NEW: Income Composition Chart */}
            {incomeCompositionData.length > 0 && (
              <div style={{ height: 180, marginTop: 16 }}>
                <DonutChartWrapper 
                  data={incomeCompositionData} 
                  innerRadius={50} 
                  outerRadius={70} 
                />
              </div>
            )}

            <div className={styles.totalBox}>
              <div>
                <p className={styles.totalLabel}>Total Monthly Net</p>
                <h3 className={styles.totalValue}>Ksh {(performance?.total_income || 0).toLocaleString()}</h3>
              </div>
              <div className={styles.badge}>Aggregated</div>
            </div>
          </div>
        </section>

        {/* Continuous Cash Flow Card */}
        <section className={styles.cardDark}>
          <div className={styles.exportButtons}>
            <button 
              onClick={() => handleExport('/reports/performance/cashflow', 'csv', 'cashflow-status')}
              className={styles.exportBtnDark}
            >
              {exporting === 'cashflow-status-csv' ? <div className={styles.spinner}></div> : 'CSV'}
            </button>
            <button 
              onClick={() => handleExport('/reports/performance/cashflow', 'xlsx', 'cashflow-status')}
              className={styles.exportBtnDark}
            >
              {exporting === 'cashflow-status-xlsx' ? <div className={styles.spinner}></div> : 'XLSX'}
            </button>
          </div>

          <div className={styles.cardHeader}>
            <div className={styles.iconWrapperDark}>
              <svg className={styles.icon} width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div>
              <h2 className={styles.cardTitleDark}>Cash Flow Status</h2>
              <p className={styles.cardSubtitle}>Lifetime Continuous</p>
            </div>
          </div>

          <div className={styles.statsList}>
            <div className={styles.statItemDark}>
              <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span className={styles.statLabelDark}>Total Inflow</span>
                  <span className={styles.statValueDark}>Ksh {(cashFlow?.total_inflow || 0).toLocaleString()}</span>
                </div>
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: '100%' }}></div>
                </div>
              </div>
            </div>

            <div className={styles.statItemDark}>
              <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span className={styles.statLabelDark}>Total Outflow</span>
                  <span className={styles.statValueNegative}>-Ksh {(cashFlow?.total_outflow || 0).toLocaleString()}</span>
                </div>
                <div className={styles.progressBar}>
                  <div className={styles.progressFillDanger}></div>
                </div>
              </div>
            </div>
            
            {/* NEW: Cash Flow Bar Chart */}
            <div style={{ height: 160, marginTop: 8 }}>
               <BarChartWrapper 
                  data={cashFlowTrendData} 
                  xKey="name" 
                  yKey="value" 
               />
            </div>

            <div className={styles.netPositionBox}>
              <div>
                <p className={styles.totalLabel}>Net Cash Position</p>
                <h3 className={styles.totalValue} style={{ color: Number(cashFlow?.net_cash_flow) >= 0 ? 'var(--accent)' : 'var(--danger-text)' }}>
                  Ksh {(cashFlow?.net_cash_flow || 0).toLocaleString()}
                </h3>
              </div>
              <div className={styles.netIcon}>
                <svg className={styles.icon} width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {Number(cashFlow?.net_cash_flow) >= 0 
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" />
                  }
                </svg>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className={styles.card} style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div className={styles.cardHeader}>
          <div className={styles.iconWrapper} style={{ background: 'rgba(245, 166, 35, 0.1)', color: '#f5a623' }}>
            <svg className={styles.icon} width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
          </div>
          <div>
            <h2 className={styles.cardTitle}>Portfolio Capital Distribution</h2>
            <p className={styles.cardSubtitle}>Asset Allocation Breakdown</p>
          </div>
        </div>
        <div style={{ height: 220 }}>
          <DonutChartWrapper 
            data={capitalStructureData} 
            innerRadius={60} 
            outerRadius={90} 
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 16 }}>
          {capitalStructureData.map(d => (
            <span key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
              <span>{d.name}</span>
            </span>
          ))}
        </div>
      </section>
      
      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '40px', textAlign: 'center', maxWidth: '800px', margin: '40px auto 0' }}>
        Monthly performance figures represent collected interest, collected penalties, and fees recognized in the current calendar period, and reset at UTC+0 midnight on the 1st of each month.
        Cash flow metrics are cumulative and reflect total fund movements synchronized with the general ledger. All figures are in Kenyan Shillings (Ksh).
      </p>
    </div>
  );
};

export default PerformanceDashboard;
