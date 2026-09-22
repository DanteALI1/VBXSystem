"use client";

import { useRouter } from "next/navigation";
import { ChevronsUpDownIcon, LogOutIcon } from "lucide-react";
import { signOut } from "@/lib/auth-client";
import type { AppRole } from "@/lib/auth/roles";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type AppShellUser = {
  email: string;
  name?: string | null;
  role: AppRole | string;
};

function initials(user: AppShellUser) {
  const source = user.name?.trim() || user.email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function UserMenu({ user }: { user: AppShellUser }) {
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-2 px-2"
            aria-label="User menu"
          />
        }
      >
        <Avatar size="sm">
          <AvatarFallback>{initials(user)}</AvatarFallback>
        </Avatar>
        <span className="hidden max-w-40 truncate text-left sm:inline">
          {user.email}
        </span>
        <Badge variant="secondary" className="hidden capitalize sm:inline-flex">
          {user.role}
        </Badge>
        <ChevronsUpDownIcon className="text-muted-foreground size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            <span className="text-foreground text-sm font-medium">
              {user.name?.trim() || user.email}
            </span>
            <span className="text-muted-foreground text-xs">{user.email}</span>
            <span className="text-muted-foreground text-xs capitalize">
              Role: {user.role}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
