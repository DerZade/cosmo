import { useApplyParams } from "@/components/analytics/use-apply-params";
import { EmptyState } from "@/components/empty-state";
import { getDashboardLayout } from "@/components/layout/dashboard-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Loader } from "@/components/ui/loader";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toolbar } from "@/components/ui/toolbar";
import { useToast } from "@/components/ui/use-toast";
import { useFeature } from "@/hooks/use-feature";
import { SubmitHandler, useZodForm } from "@/hooks/use-form";
import { useUser } from "@/hooks/use-user";
import { NextPageWithLayout } from "@/lib/page";
import {
  createConnectQueryKey,
  useMutation,
  useQuery,
} from "@connectrpc/connect-query";
import {
  EllipsisVerticalIcon,
  ExclamationTriangleIcon,
  UserPlusIcon,
} from "@heroicons/react/24/outline";
import { Cross1Icon, MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { useQueryClient } from "@tanstack/react-query";
import { EnumStatusCode } from "@wundergraph/cosmo-connect/dist/common/common_pb";
import { OrgMember } from "@wundergraph/cosmo-connect/dist/platform/v1/platform_pb";
import {
  getOrganizationMembers,
  getPendingOrganizationMembers,
  inviteUser,
  isMemberLimitReached,
  removeInvitation,
  removeOrganizationMember,
} from "@wundergraph/cosmo-connect/dist/platform/v1/platform-PlatformService_connectquery";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { useDebounce } from "use-debounce";
import { z } from "zod";
import { usePaginationParams } from "@/hooks/use-pagination-params";
import { UpdateMemberGroupDialog } from "@/components/members/update-member-group-dialog";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { formatDateTime } from "@/lib/format-date";
import { MultiGroupSelect } from "@/components/multi-group-select";

const emailInputSchema = z.object({
  email: z.string().email(),
  groups: z.array(z.string().uuid()).min(1),
});

type EmailInput = z.infer<typeof emailInputSchema>;

const InviteForm = ({ onSuccess }: { onSuccess: () => void }) => {
  const {
    register,
    formState: { isValid, errors },
    setValue,
    watch,
    reset,
    handleSubmit,
  } = useZodForm<EmailInput>({
    mode: "onChange",
    schema: emailInputSchema,
  });

  const selectedGroups = watch('groups') ?? [];

  const { mutate, isPending } = useMutation(inviteUser);

  const { toast } = useToast();

  const sendToast = (description: string) => {
    const { id } = toast({ description, duration: 3000 });
  };

  const onSubmit: SubmitHandler<EmailInput> = (data) => {
    mutate(
      { email: data.email, groups: data.groups },
      {
        onSuccess: (d) => {
          sendToast(d.response?.details || "Invited member successfully.");
          onSuccess();
          reset();
        },
        onError: (error) => {
          sendToast("Could not invite the member. Please try again.");
        },
      },
    );
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <div className="space-y-2">
        <Input
          placeholder="janedoe@example.com"
          className="w-full"
          type="text"
          {...register("email")}
        />
        {errors.email && (
          <span className="text-sm text-destructive">
            {errors.email.message}
          </span>
        )}
      </div>

      <div className="space-y-2">
        <span>What group should the member be added to?</span>
        <MultiGroupSelect
          disabled={isPending}
          value={selectedGroups}
          onValueChange={(groups) => setValue(
            'groups',
            groups.map((g) => g.groupId),
            { shouldValidate: true, shouldDirty: true, shouldTouch: true },
          )}
        />
        {errors.groups && (
          <span className="text-sm text-destructive">
            {errors.groups.message || "Please select at least one group."}
          </span>
        )}
      </div>

      <div className="text-right">
        <Button
          type="submit"
          disabled={!isValid}
          variant="default"
          isLoading={isPending}
        >
          Invite
        </Button>
      </div>
    </form>
  );
};

const MemberCard = ({
  email,
  acceptedInvite,
  joinedAt,
  isAdmin,
  isCurrentUser,
  active,
  refresh,
  onSelect,
}: {
  email: string;
  acceptedInvite: boolean;
  joinedAt?: string;
  isAdmin: boolean;
  isCurrentUser: boolean;
  active?: boolean;
  refresh: () => void;
  onSelect?(): void;
}) => {
  const { mutate: resendInvitation } = useMutation(inviteUser);
  const { mutate: revokeInvitation } = useMutation(removeInvitation);
  const { mutate: removeMember } = useMutation(removeOrganizationMember);

  const { toast, update } = useToast();

  return (
    <TableRow>
      <TableCell>{email}</TableCell>
      {acceptedInvite && (
        <TableCell className="w-1 whitespace-nowrap">
          {formatDateTime(new Date(joinedAt!))}
        </TableCell>
      )}
      {acceptedInvite ? (
        <TableCell>
          {active ? (<Badge variant="success">Active</Badge>) : (<Badge variant="destructive">Disabled</Badge>)}
        </TableCell>
      ) : (
        <TableCell className="text-sm text-gray-800 dark:text-gray-400">
          Pending
        </TableCell>
      )}
      <TableCell>
        <div className="flex min-h-6 items-center justify-between gap-x-4 text-muted-foreground">
          <div>
            {isAdmin && !isCurrentUser && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm">
                    <EllipsisVerticalIcon className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[180px]">
                  {!acceptedInvite && (
                    <DropdownMenuItem
                      onClick={() => {
                        const { id } = toast({
                          description: "Inviting member...",
                        });
                        resendInvitation(
                          { email },
                          {
                            onSuccess: (d) => {
                              update({
                                description:
                                  d.response?.details ||
                                  "Invited member successfully.",
                                duration: 2000,
                                id: id,
                              });
                            },
                            onError: (error) => {
                              update({
                                description:
                                  "Could not invite the member. Please try again.",
                                duration: 3000,
                                id: id,
                              });
                            },
                          },
                        );
                      }}
                    >
                      Resend invitation
                    </DropdownMenuItem>
                  )}
                  {acceptedInvite && onSelect && (
                    <DropdownMenuItem onClick={onSelect}>
                      Update member group
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => {
                      if (acceptedInvite) {
                        removeMember(
                          { email },
                          {
                            onSuccess: (d) => {
                              toast({
                                description:
                                  d.response?.details ||
                                  "Removed member successfully.",
                                duration: 3000,
                              });
                              refresh();
                            },
                            onError: (error) => {
                              toast({
                                description:
                                  "Could not remove member. Please try again.",
                                duration: 3000,
                              });
                            },
                          },
                        );
                      } else {
                        revokeInvitation(
                          { email },
                          {
                            onSuccess: (d) => {
                              toast({
                                description:
                                  d.response?.details ||
                                  "Removed invitation successfully.",
                                duration: 3000,
                              });
                              refresh();
                            },
                            onError: (error) => {
                              toast({
                                description:
                                  "Could not remove invitation. Please try again.",
                                duration: 3000,
                              });
                            },
                          },
                        );
                      }
                    }}
                  >
                    {acceptedInvite ? "Remove member" : "Remove invitation"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
};

const PendingInvitations = () => {
  const user = useUser();
  const isAdmin = useIsAdmin();

  const { pageSize, offset, pageNumber, search } = usePaginationParams();

  const [debouncedSearch] = useDebounce(search, 500);

  const { data, isLoading, error, refetch } = useQuery(
    getPendingOrganizationMembers,
    {
      pagination: {
        limit: pageSize,
        offset,
      },
      search: debouncedSearch,
    },
  );

  const noOfPages = Math.ceil((data?.totalCount ?? 0) / pageSize);

  if (isLoading) return <Loader fullscreen />;

  if (error || data?.response?.code !== EnumStatusCode.OK || !user)
    return (
      <EmptyState
        icon={<ExclamationTriangleIcon />}
        title="Could not retrieve pending invites of this organization."
        description={
          data?.response?.details || error?.message || "Please try again"
        }
        actions={<Button onClick={() => refetch()}>Retry</Button>}
      />
    );

  if (!data?.pendingInvitations) return null;

  return (
    <>
      <TableWrapper className="max-h-full">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-full">Email</TableHead>
              <TableHead className="">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.pendingInvitations?.map((member) => {
              return (
                <MemberCard
                  key={member.userID}
                  email={member.email}
                  acceptedInvite={false}
                  isAdmin={isAdmin || false}
                  isCurrentUser={member.email === user.email}
                  refresh={() => refetch()}
                />
              );
            })}
            {data.pendingInvitations.length === 0 && (
              <p className="w-full p-8 text-center italic text-muted-foreground">
                No invitations found
              </p>
            )}
          </TableBody>
        </Table>
      </TableWrapper>
      <Pagination limit={pageSize} noOfPages={noOfPages} pageNumber={pageNumber} />
    </>
  );
};

const AcceptedMembers = () => {
  const user = useUser();
  const isAdmin = useIsAdmin();
  const [selectedMember, setSelectedMember] = useState<OrgMember | undefined>();

  const { pageSize, offset, pageNumber, search } = usePaginationParams();

  const [debouncedSearch] = useDebounce(search, 500);

  const { data, isLoading, error, refetch } = useQuery(getOrganizationMembers, {
    pagination: {
      limit: pageSize,
      offset,
    },
    search: debouncedSearch,
  });

  const noOfPages = Math.ceil((data?.totalCount ?? 0) / pageSize);

  if (isLoading) return <Loader fullscreen />;

  if (error || data?.response?.code !== EnumStatusCode.OK || !user)
    return (
      <EmptyState
        icon={<ExclamationTriangleIcon />}
        title="Could not retrieve the members of this organization."
        description={
          data?.response?.details || error?.message || "Please try again"
        }
        actions={<Button onClick={() => refetch()}>Retry</Button>}
      />
    );

  if (!data?.members) return null;

  return (
    <>
      <UpdateMemberGroupDialog
        open={!!selectedMember}
        member={selectedMember}
        onOpenChange={(o) => {
          if (!o) {
            setSelectedMember(undefined);
          }
        }}
        refresh={refetch}
      />

      <TableWrapper className="max-h-full">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-full">Email</TableHead>
              <TableHead>Joined At</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.members?.map((member) => {
              return (
                <MemberCard
                  key={member.userID}
                  email={member.email}
                  acceptedInvite={true}
                  joinedAt={member.joinedAt}
                  isAdmin={isAdmin || false}
                  isCurrentUser={member.email === user.email}
                  active={member.active}
                  refresh={() => refetch()}
                  onSelect={() => setSelectedMember(member)}
                />
              );
            })}
          </TableBody>
          {data.members.length === 0 && (
            <p className="w-full p-8 text-center italic text-muted-foreground">
              No members found
            </p>
          )}
        </Table>
      </TableWrapper>
      <Pagination limit={pageSize} noOfPages={noOfPages} pageNumber={pageNumber} />
    </>
  );
};

const MembersToolbar = () => {
  const usersFeature = useFeature("users");
  const user = useUser();
  const organizationSlug = user?.currentOrganization.slug;
  const isAdmin = useIsAdmin();
  const client = useQueryClient();

  const { pageSize, offset, search } = usePaginationParams();

  const { data } = useQuery(isMemberLimitReached);

  const limitReached = data?.limitReached ?? false;

  if (!isAdmin) {
    return null;
  }

  return (
    <Toolbar className="w-auto">
      <Dialog>
        <DialogTrigger asChild>
          <Button>
            <UserPlusIcon className="mr-2 h-4 w-4" /> Invite Member
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {!limitReached ? "Invite Member" : "User limit reached"}
            </DialogTitle>
            <DialogDescription>
              {!limitReached
                ? "Send an invite to an email id to invite them into your organization"
                : `You have added ${data?.memberCount} of ${usersFeature?.limit} users, please upgrade your account to increase your limits.`}
            </DialogDescription>
          </DialogHeader>
          {!limitReached && (
            <InviteForm
              onSuccess={() => {
                const pendingKey = createConnectQueryKey(
                  getPendingOrganizationMembers,
                  {
                    pagination: {
                      limit: pageSize,
                      offset,
                    },
                    search,
                  },
                );
                client.invalidateQueries({
                  queryKey: pendingKey,
                });
              }}
            />
          )}
          {limitReached && (
            <Button variant="outline" asChild>
              <Link href={`/${organizationSlug}/billing`}>View plans</Link>
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </Toolbar>
  );
};

const MembersPage: NextPageWithLayout = () => {
  const router = useRouter();
  const tab = router.query.tab || "current";

  const applyParams = useApplyParams();
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 500);

  const { pageSize, offset } = usePaginationParams();

  const { data } = useQuery(getPendingOrganizationMembers, {
    pagination: {
      limit: pageSize,
      offset,
    },
    search: debouncedSearch,
  });

  return (
    <div className="flex h-full flex-col gap-y-6">
      <div className="flex flex-col justify-between gap-y-4 md:flex-row md:items-center">
        <Tabs
          onValueChange={(v) => {
            applyParams({
              tab: v,
              page: null,
              pageSize: null,
            });
          }}
          defaultValue="current"
        >
          <TabsList>
            <TabsTrigger value="current">Current</TabsTrigger>
            <TabsTrigger value="pending" className="gap-x-1">
              Pending{" "}
              {(data?.totalCount ?? 0) > 0 && (
                <Badge className="px-2">{data?.totalCount}</Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative">
          <MagnifyingGlassIcon className="absolute bottom-0 left-3 top-0 my-auto" />
          <Input
            placeholder="Search"
            className="pl-8 pr-10"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              applyParams({ search: e.target.value });
            }}
          />
          {search && (
            <Button
              variant="ghost"
              className="absolute bottom-0 right-0 top-0 my-auto rounded-l-none"
              onClick={() => {
                setSearch("");
                applyParams({ search: null });
              }}
            >
              <Cross1Icon />
            </Button>
          )}
        </div>
      </div>
      {tab === "current" ? <AcceptedMembers /> : <PendingInvitations />}
    </div>
  );
};

MembersPage.getLayout = (page) => {
  return getDashboardLayout(
    page,
    "Members",
    "Manage all the members of your organization",
    null,
    <MembersToolbar />,
  );
};

export default MembersPage;
