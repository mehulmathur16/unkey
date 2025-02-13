import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTenantId } from "@/lib/auth";
import { Permission, db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@radix-ui/react-tooltip";
import { ChevronRight } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { DeleteRole } from "./delete-role";
import { PermissionToggle } from "./permission-toggle";
import { type NestedPermissions, Tree } from "./tree";
import { UpdateRole } from "./update-role";

export const revalidate = 0;

type Props = {
  params: {
    roleId: string;
  };
};

export default async function RolesPage(props: Props) {
  const tenantId = getTenantId();

  const workspace = await db.query.workspaces.findFirst({
    where: (table, { eq }) => eq(table.tenantId, tenantId),
    with: {
      roles: {
        where: (table, { eq }) => eq(table.id, props.params.roleId),
        with: {
          permissions: true,
        },
      },
      permissions: {
        with: {
          roles: true,
        },
        orderBy: (table, { asc }) => [asc(table.name)],
      },
    },
  });
  if (!workspace) {
    return redirect("/new");
  }

  const role = workspace.roles.at(0);
  if (!role) {
    return notFound();
  }

  const nested: NestedPermissions = {};
  for (const permission of workspace.permissions) {
    let n = nested;
    const parts = permission.name.split(".");
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!(p in n)) {
        n[p] = {
          id: permission.id,
          name: permission.name,
          description: permission.description,
          checked: role.permissions.some((p) => p.permissionId === permission.id),
          part: p,
          permissions: {},
          path: parts.slice(0, i).join("."),
        };
      }
      n = n[p].permissions;
    }
  }

  return (
    <div className="flex flex-col min-h-screen gap-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-mono text-2xl font-semibold tracking-tight">{role.name}</h2>
          </div>
          <p className="text-xs text-content-subtle">{role.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <UpdateRole role={role} trigger={<Button variant="secondary">Update Role</Button>} />
          <DeleteRole role={role} trigger={<Button variant="alert">Delete Role</Button>} />
        </div>
      </div>

      <Tree nestedPermissions={nested} role={{ id: role.id }} />
    </div>
  );
}
