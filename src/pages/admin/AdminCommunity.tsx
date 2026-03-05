import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/use-toast";
import {
  deleteAdminCommunityComment,
  deleteAdminCommunityPost,
  fetchAdminCommunityComments,
  fetchAdminCommunityPosts,
} from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import { useAuth } from "@/contexts/useAuth";

const AdminCommunity = () => {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("posts");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; type: "post" | "comment" } | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const canModerate = hasPermission(user?.role ?? null, "community.moderate");
  const deleteItemLabel = deleteTarget?.type === "comment" ? "comment" : "post";

  const postsQuery = useQuery({
    queryKey: ["admin-community-posts", search],
    queryFn: () => fetchAdminCommunityPosts({ search: search.trim() || undefined }),
    enabled: activeTab === "posts",
  });

  const commentsQuery = useQuery({
    queryKey: ["admin-community-comments", search],
    queryFn: () => fetchAdminCommunityComments({ search: search.trim() || undefined }),
    enabled: activeTab === "comments",
  });

  const handleDeletePost = (id: string) => {
    if (!canModerate) return;
    setDeleteTarget({ id, type: "post" });
    setDeleteDialogOpen(true);
  };

  const handleDeleteComment = (id: string) => {
    if (!canModerate) return;
    setDeleteTarget({ id, type: "comment" });
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!canModerate || !deleteTarget || deleteSubmitting) return;
    setDeleteSubmitting(true);
    try {
      if (deleteTarget.type === "post") {
        await deleteAdminCommunityPost(deleteTarget.id);
        toast({ title: "Post deleted." });
        await postsQuery.refetch();
      } else {
        await deleteAdminCommunityComment(deleteTarget.id);
        toast({ title: "Comment deleted." });
        await commentsQuery.refetch();
      }
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to delete item.";
      toast({ title: message });
    } finally {
      setDeleteSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Community</h2>
        <p className="text-sm text-muted-foreground">Moderate community posts and comments.</p>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <Input
            placeholder="Search by content"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full md:w-64"
          />
          <Button
            variant="outline"
            onClick={() => {
              if (activeTab === "posts") {
                postsQuery.refetch();
              } else {
                commentsQuery.refetch();
              }
            }}
          >
            Refresh
          </Button>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="comments">Comments</TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="mt-4">
          <Card className="border-border/60">
            <CardContent className="p-0">
              {postsQuery.isLoading ? (
                <div className="p-6 text-sm text-muted-foreground">Loading posts...</div>
              ) : postsQuery.isError ? (
                <div className="p-6 text-sm text-muted-foreground">
                  {postsQuery.error instanceof Error ? postsQuery.error.message : "Unable to load posts."}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Post</TableHead>
                      <TableHead>Author</TableHead>
                      <TableHead>Engagement</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {postsQuery.data?.posts.map((post) => (
                      <TableRow key={post.id}>
                        <TableCell>
                          <div className="text-sm text-foreground line-clamp-2">{post.content}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(post.createdAt).toLocaleDateString()}
                          </div>
                        </TableCell>
                        <TableCell>
                          {post.author.username ?? post.author.email ?? post.author.phone ?? "-"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {post._count.likes} likes · {post._count.comments} comments
                        </TableCell>
                        <TableCell>
                          {canModerate ? (
                            <Button size="sm" variant="destructive" onClick={() => handleDeletePost(post.id)}>
                              Delete
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">No actions</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {postsQuery.data?.posts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                          No posts found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comments" className="mt-4">
          <Card className="border-border/60">
            <CardContent className="p-0">
              {commentsQuery.isLoading ? (
                <div className="p-6 text-sm text-muted-foreground">Loading comments...</div>
              ) : commentsQuery.isError ? (
                <div className="p-6 text-sm text-muted-foreground">
                  {commentsQuery.error instanceof Error ? commentsQuery.error.message : "Unable to load comments."}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Comment</TableHead>
                      <TableHead>Author</TableHead>
                      <TableHead>Post</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commentsQuery.data?.comments.map((comment) => (
                      <TableRow key={comment.id}>
                        <TableCell>
                          <div className="text-sm text-foreground line-clamp-2">{comment.content}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(comment.createdAt).toLocaleDateString()}
                          </div>
                        </TableCell>
                        <TableCell>
                          {comment.author.username ?? comment.author.email ?? comment.author.phone ?? "-"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground line-clamp-1">
                          {comment.post.content}
                        </TableCell>
                        <TableCell>
                          {canModerate ? (
                            <Button size="sm" variant="destructive" onClick={() => handleDeleteComment(comment.id)}>
                              Delete
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">No actions</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {commentsQuery.data?.comments.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                          No comments found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteItemLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The {deleteItemLabel} will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteSubmitting}
            >
              {deleteSubmitting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminCommunity;
