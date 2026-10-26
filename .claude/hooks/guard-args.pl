#!/usr/bin/env perl
# Argument-level checks for guard-bash.sh, over normalized commands (one per line on stdin).
# Dies with the reason when a command must be blocked. BRANCH = the repo's current branch.
#   git push: no force (--force*, -f in a flag cluster, +refspec), no --mirror/--all, no deletes
#             (--delete, -d, :refspec), never to main/master (incl. refs/heads/…, and HEAD or a
#             bare push while on main or after `git switch main` earlier in the same command).
#   rm -r:    only targets under /tmp, /private/tmp or the scratchpad, and never with `..`.
use strict;
use warnings;

my $branch = $ENV{BRANCH} // '';
my $main = qr/^(?:main|master)$/;
my $git = qr/^git(?:\s+-[Cc]\s+\S+)*\s+/;

for (<STDIN>) {
  chomp;
  if (/${git}(?:switch|checkout)\s+(?:-\S+\s+)*(\S+)/) {
    $branch = $1;
    next;
  }
  if (/${git}push\b(.*)$/) {
    my (@pos, $redirect);
    for my $t (grep { length } split /\s+/, $1) {
      if ($redirect) { $redirect = 0; next }
      if ($t =~ /^\d*[<>]+$/) { $redirect = 1; next }
      next if $t =~ /^\d*[<>]/;
      die "force-push is never allowed.\n"
        if $t =~ /^--force(?:-with-lease|-if-includes)?(?:=|$)/ || $t =~ /^-[a-zA-Z]*f[a-zA-Z]*$/;
      die "--mirror/--all would push main as well.\n" if $t =~ /^--(?:mirror|all)$/;
      die "deleting remote branches is not allowed.\n" if $t eq '--delete' || $t =~ /^-[a-zA-Z]*d[a-zA-Z]*$/;
      push @pos, $t unless $t =~ /^-/;
    }
    shift @pos;    # the remote
    if (!@pos) {
      die "on main: 'git push' would push main. Switch to a factory/* branch first.\n" if $branch =~ $main;
      next;
    }
    for my $r (@pos) {
      die "force-push is never allowed.\n" if $r =~ /^\+/;
      die "deleting remote branches is not allowed.\n" if $r =~ /^:/;
      (my $dst = $r =~ /:(.*)$/ ? $1 : $r) =~ s{^refs/heads/}{};
      die "never push to main — push the factory/* branch and open a PR.\n"
        if $dst =~ $main || ($dst eq 'HEAD' && $branch =~ $main);
    }
  }
  if (/^rm\s+(.*)$/) {
    my @t = grep { length } split /\s+/, $1;
    next unless grep { $_ eq '--recursive' || /^-[a-zA-Z]*[rR]/ } @t;
    my $redirect;
    for my $t (@t) {
      if ($redirect) { $redirect = 0; next }
      if ($t =~ /^\d*[<>]+$/) { $redirect = 1; next }
      next if $t =~ /^-/ || $t =~ /^\d*[<>]/;
      die "recursive rm outside the scratchpad/tmp ($t) is not allowed.\n"
        if $t =~ /\.\./ || $t !~ m{^(?:/private)?/tmp/|/scratchpad/};
    }
  }
}
