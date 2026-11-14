export type TenantScope = {
  tenantId: string;
  branchId: string;
};

export function isTenantScoped(
  value: Partial<TenantScope> | undefined,
): value is TenantScope {
  return !!value?.tenantId && !!value?.branchId;
}

export function tenantScopeClause(
  alias = 't',
  tenantParam = '$1',
  branchParam = '$2',
) {
  return `${alias}.tenant_id = ${tenantParam} AND ${alias}.branch_id = ${branchParam}`;
}
