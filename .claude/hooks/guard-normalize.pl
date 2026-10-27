#!/usr/bin/env perl
# Turns a Bash tool command into one simple command per line, so guard-bash.sh can match commands
# at their real start. It keeps what the shell would execute and drops what it wouldn't:
#   - heredoc bodies are dropped (file content), unless the heredoc is fed to a shell
#     (`bash <<EOF`, `cat <<EOF | sh`) — then the body is commands; for unquoted heredocs the
#     $(...) / `...` substitutions in the body are kept, since the shell runs them;
#   - strings run via `sh -c '...'` and $(...) / `...` substitutions are added as extra lines;
#   - quoted text is replaced by Q, so messages and grep patterns can't look like commands
#     (with GUARD_KEEP_QUOTES=1 the quotes are dropped and the text kept, for checks on arguments
#     such as file paths);
#   - lines are split on ; & | && || ( ) { } and newlines, and leading keywords (then, do, if, !,
#     env, sudo, command, exec, nohup, time, xargs) and VAR=value prefixes are removed.
use strict;
use warnings;

my $s = do { local $/; <STDIN> } // '';
my @extra;
my $shell = qr/(?:^|[|;&(\s])(?:bash|sh|zsh)(?:\s|$)/;

$s =~ s{<<-?[ \t]*(['"]?)(\w+)\1([^\n]*)\n(.*?)^\t*\2[ \t]*$}{
  my ($quoted, $tag, $rest, $body) = ($1, $2, $3, $4); # inner matches below reset $1..$4
  my ($prefix) = ($` =~ /([^\n]*)\z/);
  if (($prefix . ' ' . $rest) =~ $shell) {
    push @extra, split /\n/, $body;
  } elsif (!$quoted) {
    push @extra, $1 while $body =~ /\$\(([^()]*)\)/g;
    push @extra, $1 while $body =~ /`([^`]*)`/g;
  }
  "<<$tag$rest";
}gmse;

push @extra, $2 while $s =~ /\b(?:bash|sh|zsh)\s+(?:-\w+\s+)*-\w*c\s+(['"])(.*?)\1/g;
# Single-quoted text and backslash-escaped characters (\` \$) are literal; substitutions elsewhere
# (even inside double quotes) do run.
(my $unquoted = $s) =~ s/'[^']*'/Q/g;
$unquoted =~ s/\\./E/g;
push @extra, $1 while $unquoted =~ /\$\(([^()]*)\)/g;
push @extra, $1 while $unquoted =~ /`([^`]*)`/g;

# GUARD_FLAT=1: the executed text unsplit (pipes kept), quoted text as Q, heredoc file bodies gone.
if ($ENV{GUARD_FLAT}) {
  for my $text ($s, @extra) {
    (my $t = $text) =~ s/'[^']*'/Q/g;
    $t =~ s/"(?:[^"\\]|\\.)*"/Q/g;
    print "$t\n";
  }
  exit 0;
}

for my $text ($s, @extra) {
  my $t = $text;
  if ($ENV{GUARD_KEEP_QUOTES}) {
    $t =~ s/'([^']*)'/$1/g;
    $t =~ s/"((?:[^"\\]|\\.)*)"/$1/g;
  } else {
    $t =~ s/'[^']*'/Q/g;
    $t =~ s/"(?:[^"\\]|\\.)*"/Q/g;
  }
  for my $seg (split /&&|\|\||[;&|(){}\n]/, $t) {
    $seg =~ s/^\s+//;
    1 while $seg =~ s/^(?:then|do|else|elif|if|while|until|!|time|env|sudo|command|exec|nohup|xargs)(?:\s+|$)//
          || $seg =~ s/^[A-Za-z_][A-Za-z0-9_]*=\S*\s+//
          || $seg =~ s/^\$\s*//;
    $seg =~ s/\s+$//;
    print "$seg\n" if length $seg;
  }
}
