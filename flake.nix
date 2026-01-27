{
  description = "Klopf Card Game - TypeScript Monorepo";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        packages = with pkgs; [
          # TypeScript/JavaScript runtime
          bun
          nodejs_22
          nodePackages.pnpm
          nodePackages.typescript

          # Go (archived backend reference)
          go
          gopls
        ];

        shellHook = ''
          echo "🃏 Klopf Game Dev Environment"
          echo ""
          echo "Tools:"
          echo "  Bun:  $(bun --version)"
          echo "  Node: $(node --version)"
          echo "  pnpm: $(pnpm --version)"
          echo ""
          echo "Commands:"
          echo "  pnpm install        - Install all dependencies"
          echo "  pnpm dev:backend    - Start TypeScript backend (port 8080)"
          echo "  pnpm dev:frontend   - Start Angular frontend (port 4200)"
          echo "  pnpm dev            - Start both in parallel"
          echo ""
          echo "Structure:"
          echo "  packages/shared/    - Shared types (@klopf/shared)"
          echo "  backend/            - Bun + ElysiaJS server"
          echo "  frontend/           - Angular app"
          echo "  backend-go/         - Archived Go backend"
        '';
      };
    };
}
