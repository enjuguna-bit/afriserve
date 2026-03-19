import type { AdminBranch } from '../../../types/admin'

export type BranchAreaOption = {
  key: string
  label: string
  branchIds: number[]
  branchCount: number
  branchLabels: string[]
}

function getAreaKey(branch: AdminBranch): string {
  const regionId = Number(branch.region_id)
  if (Number.isInteger(regionId) && regionId > 0) {
    return `region:${regionId}`
  }

  const regionName = String(branch.region_name || '').trim()
  if (regionName) {
    return `name:${regionName.toLowerCase()}`
  }

  return 'unknown'
}

function getAreaLabel(branch: AdminBranch): string {
  const regionName = String(branch.region_name || '').trim()
  if (regionName) {
    return regionName
  }

  const regionId = Number(branch.region_id)
  if (Number.isInteger(regionId) && regionId > 0) {
    return `Region ${regionId}`
  }

  return 'Unassigned area'
}

function getBranchLabel(branch: AdminBranch): string {
  return branch.code ? `${branch.name} (${branch.code})` : branch.name
}

export function buildBranchAreaOptions(branches: AdminBranch[]): BranchAreaOption[] {
  const grouped = new Map<string, { label: string; branches: Array<{ id: number; label: string }> }>()

  branches.forEach((branch) => {
    const branchId = Number(branch.id)
    if (!Number.isInteger(branchId) || branchId <= 0) {
      return
    }

    const areaKey = getAreaKey(branch)
    const areaLabel = getAreaLabel(branch)
    const existing = grouped.get(areaKey)

    if (existing) {
      existing.branches.push({ id: branchId, label: getBranchLabel(branch) })
      return
    }

    grouped.set(areaKey, {
      label: areaLabel,
      branches: [{ id: branchId, label: getBranchLabel(branch) }],
    })
  })

  return [...grouped.entries()]
    .map(([key, area]) => {
      const sortedBranches = [...area.branches].sort((left, right) => left.label.localeCompare(right.label))

      return {
        key,
        label: area.label,
        branchIds: sortedBranches.map((branch) => branch.id),
        branchCount: sortedBranches.length,
        branchLabels: sortedBranches.map((branch) => branch.label),
      }
    })
    .sort((left, right) => left.label.localeCompare(right.label))
}