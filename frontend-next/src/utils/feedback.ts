/**
 * Human-language feedback messages.
 *
 * Replace generic "Entry 204 status: 200 OK" / "Operation successful" patterns
 * with contextual, role-appropriate language that tells the user *what happened*
 * in plain English.
 *
 * Usage:
 *   toast.success(feedback.loan.repayment('4,500', 'Grace Wanjiku'))
 *   // → "Payment of Ksh 4,500 recorded for Grace Wanjiku"
 */

export const feedback = {
  client: {
    created: (name: string) =>
      `${name} has been added as a borrower`,
    updated: (name: string) =>
      `${name}'s profile has been updated`,
    deleted: (name: string) =>
      `${name} has been removed from the portfolio`,
    reallocated: (name: string, toOfficer: string) =>
      `${name} has been moved to ${toOfficer}'s portfolio`,
    activated: (name: string) =>
      `${name}'s account is now active`,
    dormantMarked: (name: string) =>
      `${name} has been marked as dormant`,
  },

  loan: {
    created: (amount: string, clientName: string) =>
      `Ksh ${amount} loan for ${clientName} has been submitted for approval`,
    approved: (clientName: string) =>
      `${clientName}'s loan has been approved and is ready for disbursement`,
    rejected: (clientName: string, reason?: string) =>
      reason
        ? `${clientName}'s application was declined — ${reason}`
        : `${clientName}'s application was declined`,
    disbursed: (amount: string, clientName: string) =>
      `Ksh ${amount} has been disbursed to ${clientName}`,
    repayment: (amount: string, clientName: string) =>
      `Payment of Ksh ${amount} recorded for ${clientName}`,
    writtenOff: (clientName: string) =>
      `${clientName}'s loan has been written off`,
    restructured: (clientName: string) =>
      `${clientName}'s loan terms have been restructured`,
    topUp: (amount: string, clientName: string) =>
      `Top-up of Ksh ${amount} added to ${clientName}'s loan`,
    refinanced: (clientName: string) =>
      `${clientName}'s loan has been refinanced`,
  },

  guarantor: {
    added: (guarantorName: string, clientName: string) =>
      `${guarantorName} has been added as a guarantor for ${clientName}`,
    removed: (guarantorName: string) =>
      `${guarantorName} has been removed as a guarantor`,
  },

  collateral: {
    added: (description: string, clientName: string) =>
      `${description} has been registered as collateral for ${clientName}`,
    released: (description: string) =>
      `${description} has been released`,
  },

  mobileMoney: {
    topUpQueued: (amount: string, phone: string) =>
      `Ksh ${amount} top-up queued for ${phone}`,
    topUpSuccess: (amount: string, phone: string) =>
      `Ksh ${amount} sent successfully to ${phone}`,
    topUpFailed: (phone: string) =>
      `Transfer to ${phone} could not be completed — please try again`,
  },

  system: {
    sessionExpired: () =>
      'Your session has ended. Please sign in to continue.',
    offlineWarning: () =>
      'You appear to be offline. Changes will sync when reconnected.',
    exportReady: (reportLabel: string) =>
      `Your ${reportLabel} report is ready to download`,
    savedDraft: () =>
      'Draft saved',
    unsavedChanges: () =>
      'You have unsaved changes — are you sure you want to leave?',
    permissionDenied: () =>
      'You don\'t have permission to perform this action. Contact your administrator.',
  },
} as const
